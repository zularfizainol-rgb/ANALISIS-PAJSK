import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  LineChart, Line, AreaChart, Area
} from 'recharts';
import { Upload, BarChart3, TrendingUp, Download, Users, Award, Trophy, Target, Info, Activity, FileDown, LogOut, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AggregatePajskData, ViewMode } from './types';
import { cn } from './lib/utils';
import { auth, googleProvider, savePajskData, loadPajskData } from './firebase';
import { signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';

export default function App() {
  const [globalLoading, setGlobalLoading] = useState(false);
  
  const [data, setData] = useState<AggregatePajskData[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('yearly');
  
  // Load initial data
  useEffect(() => {
    const fetchData = async () => {
      setGlobalLoading(true);
      try {
        const loadedData = await loadPajskData();
        if (loadedData && loadedData.length > 0) {
          setData(loadedData);
        }
      } catch (e) {
        console.error("Error loading data", e);
      } finally {
        setGlobalLoading(false);
      }
    };
    fetchData();
  }, []);

  const availableYears = useMemo(() => {
    const years = Array.from(new Set(data.map(d => d.tahun))).sort((a, b) => b - a);
    return years;
  }, [data]);

  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  
  // Update selected year automatically when new data arrives
  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    } else if (availableYears.length > 0 && availableYears.includes(selectedYear)) {
       // Keep it
    } else if (availableYears.length > 0) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- FILE UPLOAD LOGIC ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    // If auth is strictly required, ensure user is set
    
    const file = e.target.files?.[0];
    if (!file) return;

    setGlobalLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const jsonData = XLSX.utils.sheet_to_json(ws);
        
        // Map the Excel columns to our aggregate format
        const parsedData: AggregatePajskData[] = jsonData.map((row: any) => {
          const a = parseInt(row['Gred A'] || row['GRED A']) || 0;
          const b = parseInt(row['Gred B'] || row['GRED B']) || 0;
          const c = parseInt(row['Gred C'] || row['GRED C']) || 0;
          const d = parseInt(row['Gred D'] || row['GRED D']) || 0;
          const e = parseInt(row['Gred E'] || row['GRED E']) || 0;
          const tl = parseInt(row['TL'] || row['TIDAK LAKSANA'] || row['Tidak Laksana']) || 0;
          const totalGradeCount = a + b + c + d + e + tl;

          return {
            tahun: parseInt(row['Tahun'] || row['TAHUN']) || new Date().getFullYear(),
            aliran: String(row['Aliran'] || row['ALIRAN'] || row['Tingkatan'] || row['TINGKATAN'] || 'Keseluruhan'),
            jumlahPelajar: parseInt(row['Jumlah Pelajar'] || row['JUMLAH PELAJAR']) || totalGradeCount,
            gredA: a,
            gredB: b,
            gredC: c,
            gredD: d,
            gredE: e,
            gredTL: tl,
          };
        });

        // Merge with existing data based on tahun and aliran
        const mergedDataMap = new Map();
        
        // Add existing data first
        data.forEach(d => {
          mergedDataMap.set(`${d.tahun}_${d.aliran}`, d);
        });
        
        // Override with new data
        parsedData.forEach(d => {
          mergedDataMap.set(`${d.tahun}_${d.aliran}`, d);
        });
        
        const finalizedData = Array.from(mergedDataMap.values());

        // Save to Firebase
        await savePajskData(finalizedData);
        setData(finalizedData);
        alert("Data telah berjaya disimpan ke pangkalan data.");
      } catch (error) {
        console.error("Error parsing/saving Excel file", error);
        alert("Ralat semasa membaca/menyimpan fail Excel. Sila pastikan format betul.");
      } finally {
        setGlobalLoading(false);
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = ''; // Reset input
  };

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { TAHUN: 2024, ALIRAN: "Tahun 4", "JUMLAH PELAJAR": 55, "GRED A": 15, "GRED B": 20, "GRED C": 10, "GRED D": 5, "GRED E": 3, "TL": 2 },
      { TAHUN: 2024, ALIRAN: "Tahun 5", "JUMLAH PELAJAR": 58, "GRED A": 20, "GRED B": 25, "GRED C": 8, "GRED D": 3, "GRED E": 2, "TL": 0 },
      { TAHUN: 2024, ALIRAN: "Tahun 6", "JUMLAH PELAJAR": 58, "GRED A": 25, "GRED B": 20, "GRED C": 12, "GRED D": 1, "GRED E": 0, "TL": 0 }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Templat PAJSK Keseluruhan");
    XLSX.writeFile(wb, "Templat_Data_Keseluruhan_PAJSK.xlsx");
  };

  const handleDownloadData = () => {
    if (data.length === 0) return alert("Tiada data untuk dimuat turun.");
    const exportData = data.map(d => ({
      TAHUN: d.tahun,
      ALIRAN: d.aliran,
      "JUMLAH PELAJAR": d.jumlahPelajar,
      "GRED A": d.gredA,
      "GRED B": d.gredB,
      "GRED C": d.gredC,
      "GRED D": d.gredD,
      "GRED E": d.gredE,
      "TL": d.gredTL
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data Semasa PAJSK");
    XLSX.writeFile(wb, "Eksport_Data_PAJSK.xlsx");
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col relative w-full">
      {globalLoading && (
        <div className="fixed inset-0 bg-white/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
        </div>
      )}

      {/* HEADER */}
      <header className="bg-indigo-600 text-white shadow-md relative z-10 w-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-lg">
              <Target className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Analisis PAJSK</h1>
              <p className="text-indigo-200 text-sm">Pentaksiran Aktiviti Jasmani, Sukan & Kokurikulum</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-end">
            <button 
              onClick={handleDownloadTemplate}
              className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-sm px-4 py-2 rounded-md transition-colors shadow-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Templat Excel
            </button>
            <button 
              onClick={handleDownloadData}
              className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white text-sm px-4 py-2 rounded-md transition-colors shadow-sm font-medium"
            >
              <FileDown className="w-4 h-4" />
              Eksport Data
            </button>
            <label className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white text-sm px-4 py-2 rounded-md transition-colors shadow-sm font-medium cursor-pointer">
              <Upload className="w-4 h-4" />
              Muat Naik Data
              <input 
                type="file" 
                accept=".xlsx, .xls, .csv" 
                className="hidden" 
                onChange={handleFileUpload}
                ref={fileInputRef}
              />
            </label>
          </div>
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <div className="flex-1 flex flex-col w-full">
        {/* NAVIGATION TABS */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 w-full">
            <div className="flex bg-white rounded-lg p-1 shadow-sm border border-slate-200 max-w-fit">
              <button
                onClick={() => setViewMode('yearly')}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium transition-all duration-200",
                  viewMode === 'yearly' ? "bg-indigo-50 text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                )}
              >
                <BarChart3 className="w-4 h-4" />
                Analisis Mengikut Tahun
              </button>
              <button
                onClick={() => setViewMode('comparison')}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium transition-all duration-200",
                  viewMode === 'comparison' ? "bg-indigo-50 text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                )}
              >
                <TrendingUp className="w-4 h-4" />
                Perbandingan Antara Tahun
              </button>
            </div>
          </div>

          {/* MAIN CONTENT AREA */}
          <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full overflow-hidden">
            <AnimatePresence mode="wait">
              {viewMode === 'yearly' ? (
                <motion.div
                  key="yearly"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <YearlyAnalysis data={data} availableYears={availableYears} selectedYear={selectedYear} onYearChange={setSelectedYear} />
                </motion.div>
              ) : (
                <motion.div
                  key="comparison"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <ComparisonAnalysis data={data} availableYears={availableYears} />
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </div>
    </div>
  );
}

// --- SUBVIEWS ---

function YearlyAnalysis({ 
  data, 
  availableYears, 
  selectedYear, 
  onYearChange 
}: { 
  data: AggregatePajskData[], 
  availableYears: number[], 
  selectedYear: number,
  onYearChange: (y: number) => void
}) {
  const yearDataAllAliran = useMemo(() => data.filter(d => d.tahun === selectedYear), [data, selectedYear]);

  // Aggregate all 'aliran' for the year
  const yearData = useMemo(() => {
    const agg = {
      tahun: selectedYear, jumlahPelajar: 0, gredA: 0, gredB: 0, gredC: 0, gredD: 0, gredE: 0, gredTL: 0
    };
    yearDataAllAliran.forEach(d => {
      agg.jumlahPelajar += (d.jumlahPelajar || 0);
      agg.gredA += (d.gredA || 0);
      agg.gredB += (d.gredB || 0);
      agg.gredC += (d.gredC || 0);
      agg.gredD += (d.gredD || 0);
      agg.gredE += (d.gredE || 0);
      agg.gredTL += (d.gredTL || 0);
    });
    return agg;
  }, [yearDataAllAliran, selectedYear]);

  // Calculate stream (aliran) data for charts
  const aliranData = useMemo(() => {
    return yearDataAllAliran.map(d => {
      const totalEval = d.gredA + d.gredB + d.gredC + d.gredD + d.gredE;
      const totalPoints = (d.gredA * 1) + (d.gredB * 2) + (d.gredC * 3) + (d.gredD * 4) + (d.gredE * 5);
      const gps = totalEval > 0 ? parseFloat((totalPoints / totalEval).toFixed(2)) : 0;
      return {
        name: d.aliran,
        GPS: gps,
        'Cemerlang (A & B)': d.gredA + d.gredB,
        'Sederhana (C)': d.gredC,
        'Lemah (D/E/TL)': d.gredD + d.gredE + d.gredTL,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [yearDataAllAliran]);

  // Calculations
  const totalStudents = yearData.jumlahPelajar;
  const totalEvaluated = yearData.gredA + yearData.gredB + yearData.gredC + yearData.gredD + yearData.gredE;
  
  const gpsValue = useMemo(() => {
    if (totalEvaluated === 0) return "0.00";
    const totalPoints = (yearData.gredA * 1) + (yearData.gredB * 2) + (yearData.gredC * 3) + (yearData.gredD * 4) + (yearData.gredE * 5);
    return (totalPoints / totalEvaluated).toFixed(2);
  }, [yearData, totalEvaluated]);
  
  const gradeDistribution = useMemo(() => {
    return [
      { name: 'Gred A', count: yearData.gredA, fill: '#10b981' }, // Emerald
      { name: 'Gred B', count: yearData.gredB, fill: '#3b82f6' }, // Blue
      { name: 'Gred C', count: yearData.gredC, fill: '#f59e0b' }, // Amber
      { name: 'Gred D', count: yearData.gredD, fill: '#f97316' }, // Orange
      { name: 'Gred E', count: yearData.gredE, fill: '#ef4444' }, // Red
      { name: 'TL', count: yearData.gredTL, fill: '#94a3b8' }, // Slate/Gray
    ];
  }, [yearData]);

  const excellentCount = gradeDistribution[0].count + gradeDistribution[1].count; // A + B

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Prestasi Keseluruhan</h2>
          <p className="text-slate-500 text-sm">Pecahan rekod bagi tahun {selectedYear}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-600">Pilih Tahun:</label>
          <select 
            value={selectedYear} 
            onChange={(e) => onYearChange(parseInt(e.target.value))}
            className="bg-white border border-slate-300 text-slate-900 rounded-md py-2 px-4 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            {availableYears.length === 0 && <option value={selectedYear}>{selectedYear}</option>}
            {availableYears.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {totalStudents === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
          <Info className="w-12 h-12 mx-auto text-slate-400 mb-4" />
          <p>Tiada data dijumpai untuk tahun {selectedYear}. Sila muat naik fail Excel.</p>
        </div>
      ) : (
        <>
          {/* KPI CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <ScoreCard 
              title="Jumlah Pelajar" 
              value={totalStudents.toString()} 
              subValue={`${yearData.gredTL} Tidak Laksana (TL)`}
              icon={<Users className="w-5 h-5 text-indigo-600" />} 
              bgClass="bg-indigo-50"
            />
            <ScoreCard 
              title="Gred Purata Sekolah (GPS)" 
              value={gpsValue} 
              subValue="Nilai lebih rendah lebih baik (1.0 - 5.0)"
              icon={<Activity className="w-5 h-5 text-purple-600" />} 
              bgClass="bg-purple-50"
            />
            <ScoreCard 
              title="Prestasi Cemerlang (A/B)" 
              value={excellentCount.toString()} 
              subValue={`${((excellentCount / (totalStudents || 1)) * 100).toFixed(1)}% mendapat A/B`}
              icon={<Trophy className="w-5 h-5 text-blue-600" />} 
              bgClass="bg-blue-50"
            />
            <ScoreCard 
              title="Tidak Laksana (TL)" 
              value={yearData.gredTL.toString()} 
              subValue="Murid tanpa rekod penilaian"
              icon={<Info className="w-5 h-5 text-slate-600" />} 
              bgClass="bg-slate-100"
            />
          </div>

          {/* CHARTS */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 lg:col-span-2">
              <h3 className="text-lg font-semibold text-slate-800 mb-6">Taburan Gred Keseluruhan PAJSK</h3>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={gradeDistribution} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                    <RechartsTooltip 
                      cursor={{ fill: '#f1f5f9' }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={50} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Ringkasan Analisis</h3>
              <div className="space-y-4">
                {gradeDistribution.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.fill }} />
                      <span className="font-medium text-slate-700">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-slate-900">{item.count}</div>
                      <div className="text-xs text-slate-500">{((item.count / totalStudents) * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ALIRAN CHARTS */}
          {aliranData.length > 0 && !(aliranData.length === 1 && aliranData[0].name === 'Keseluruhan') && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-6">Prestasi Mengikut Aliran (GPS)</h3>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={aliranData} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                      <YAxis domain={[1, 'auto']} axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                      <RechartsTooltip 
                        cursor={{ fill: '#f1f5f9' }}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: any) => [parseFloat(value).toFixed(2), 'GPS']}
                      />
                      <Bar dataKey="GPS" radius={[4, 4, 0, 0]} barSize={40} fill="#9333ea" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-6">Pencapaian Gred Mengikut Aliran</h3>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={aliranData} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                      <RechartsTooltip 
                        cursor={{ fill: '#f1f5f9' }}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                      <Bar dataKey="Cemerlang (A & B)" stackId="a" fill="#3b82f6" barSize={40} />
                      <Bar dataKey="Sederhana (C)" stackId="a" fill="#f59e0b" barSize={40} />
                      <Bar dataKey="Lemah (D/E/TL)" stackId="a" fill="#ef4444" barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          )}
        </>
      )}
    </div>
  );
}

function ComparisonAnalysis({ data, availableYears }: { data: AggregatePajskData[], availableYears: number[] }) {
  
  const comparisonData = useMemo(() => {
    // Need at least 2 data points for comparison
    const sortedYears = [...availableYears].sort((a, b) => a - b);
    
    return sortedYears.map(year => {
      const yearDataAllAliran = data.filter(d => d.tahun === year);
      if (yearDataAllAliran.length === 0) return null;

      const agg = { tahun: year, jumlahPelajar: 0, gredA: 0, gredB: 0, gredC: 0, gredD: 0, gredE: 0 };
      yearDataAllAliran.forEach(d => {
        agg.jumlahPelajar += (d.jumlahPelajar || 0);
        agg.gredA += (d.gredA || 0);
        agg.gredB += (d.gredB || 0);
        agg.gredC += (d.gredC || 0);
        agg.gredD += (d.gredD || 0);
        agg.gredE += (d.gredE || 0);
      });

      const total = agg.jumlahPelajar || 1; // avoid division by zero
      const totalEvaluated = agg.gredA + agg.gredB + agg.gredC + agg.gredD + agg.gredE;
      const totalPoints = (agg.gredA * 1) + (agg.gredB * 2) + (agg.gredC * 3) + (agg.gredD * 4) + (agg.gredE * 5);
      const gps = totalEvaluated > 0 ? parseFloat((totalPoints / totalEvaluated).toFixed(2)) : 0;

      return {
        year: year.toString(),
        'Peratus Gred A (%)': parseFloat(((agg.gredA / total) * 100).toFixed(1)),
        'Peratus Gred B (%)': parseFloat(((agg.gredB / total) * 100).toFixed(1)),
        'Jumlah Pelajar': agg.jumlahPelajar,
        'GPS': gps
      };
    }).filter(Boolean);
  }, [data, availableYears]);

  if (availableYears.length < 2) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
         <Info className="w-12 h-12 mx-auto text-slate-400 mb-4" />
         <h3 className="text-lg font-semibold text-slate-900 mb-2">Maklumat Tidak Mencukupi</h3>
         <p>Anda memerlukan sekurang-kurangnya data untuk 2 tahun berbeza bagi memaparkan perbandingan.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Trend & Perbandingan Antara Tahun</h2>
        <p className="text-slate-500 text-sm">Menunjukkan perkembangan prestasi PAJSK dari masa ke semasa.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* AREA CHART FOR % GRED A & B */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
           <h3 className="text-lg font-semibold text-slate-800 mb-6">Trend Peningkatan Gred Cemerlang (A & B)</h3>
           <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={comparisonData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorB" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} unit="%" />
                <RechartsTooltip 
                  cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                <Area type="monotone" dataKey="Peratus Gred A (%)" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorA)" />
                <Area type="monotone" dataKey="Peratus Gred B (%)" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorB)" />
              </AreaChart>
            </ResponsiveContainer>
           </div>
        </div>

        {/* LINE CHART FOR GPS */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
           <div>
             <h3 className="text-lg font-semibold text-slate-800 mb-1">Trend Gred Purata Sekolah (GPS)</h3>
             <p className="text-xs text-slate-500 mb-5">Nilai GPS lebih rendah menunjukkan pencapaian lebih baik.</p>
           </div>
           <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={comparisonData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                {/* We reverse the Y-axis so lower GPS values visually appear higher (better) */}
                <YAxis reversed={true} domain={['dataMin - 0.2', 'dataMax + 0.2']} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <RechartsTooltip 
                  cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: any) => [parseFloat(value).toFixed(2), 'GPS']}
                />
                <Line 
                  type="monotone" 
                  dataKey="GPS" 
                  stroke="#9333ea" 
                  strokeWidth={3}
                  activeDot={{ r: 6, fill: '#9333ea', stroke: '#fff', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
           </div>
        </div>
      </div>
    </div>
  );
}

// --- SHARED UI ---

function ScoreCard({ title, value, subValue, icon, bgClass }: { title: string, value: string, subValue?: string, icon: React.ReactNode, bgClass: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-start gap-4 transition-all hover:shadow-md">
      <div className={cn("p-4 rounded-xl flex items-center justify-center", bgClass)}>
        {icon}
      </div>
      <div>
        <h3 className="text-slate-500 font-medium text-sm mb-1">{title}</h3>
        <p className="text-3xl font-bold text-slate-900 tracking-tight">{value}</p>
        {subValue && (
          <p className="text-sm text-slate-500 mt-1 font-medium">{subValue}</p>
        )}
      </div>
    </div>
  );
}

