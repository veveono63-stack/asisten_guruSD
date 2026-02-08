
import React, { useState, useEffect } from 'react';
import { Teacher, SchoolIdentity, ExtracurricularData, ExtracurricularActivity, ExtracurricularEntry } from '../types';
import { getTeacherProfile, getSchoolIdentity, getExtracurricularData, updateExtracurricularData, getCalendarEvents } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { ArrowDownTrayIcon, PencilIcon, TrashIcon, SparklesIcon, ChevronDownIcon } from './Icons';
import { generateContentWithRotation } from '../services/geminiService';
import { Type } from '@google/genai';
import WrappingTextarea from './WrappingTextarea';

declare const jspdf: any;

interface ExtracurricularBookProps {
    selectedClass: string;
    selectedYear: string;
    userId?: string;
}

const ExtracurricularBook: React.FC<ExtracurricularBookProps> = ({ selectedClass, selectedYear, userId }) => {
    const [semester, setSemester] = useState<'Ganjil' | 'Genap'>('Ganjil');
    const [extracurricularData, setExtracurricularData] = useState<ExtracurricularData>({ activities: [] });
    const [selectedActivityId, setSelectedActivityId] = useState<string>('');
    const [teacher, setTeacher] = useState<Teacher | null>(null);
    const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);
    const [signatureDate, setSignatureDate] = useState(new Date().toISOString().split('T')[0]);
    const [isPdfDropdownOpen, setIsPdfDropdownOpen] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [newActivityName, setNewActivityName] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                // SINKRONISASI: Mengambil data dari database guru jika userId tersedia
                const [data, teacherProfile, identity] = await Promise.all([
                    getExtracurricularData(selectedYear, selectedClass, semester, userId),
                    getTeacherProfile(selectedYear, selectedClass, userId),
                    getSchoolIdentity(userId)
                ]);
                
                setExtracurricularData(data);
                if (data.activities.length > 0) {
                    setSelectedActivityId(data.activities[0].id);
                }
                setTeacher(teacherProfile);
                setSchoolIdentity(identity);
            } catch (error: any) {
                setNotification({ message: error.message || 'Gagal memuat data.', type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [selectedClass, selectedYear, semester, userId]);

    const createEmptyEntry = (): ExtracurricularEntry => ({
        id: crypto.randomUUID(),
        materi: '',
        rencanaPelaksanaan: '',
        tanggal: '',
        jmlSiswa: '',
        hadir: '',
        tidakHadir: '',
        keterangan: '',
        signature: ''
    });

    const handleAddActivity = async () => {
        if (!newActivityName.trim()) return;
        setIsSaving(true);
        try {
            const newActivity: ExtracurricularActivity = {
                id: crypto.randomUUID(),
                name: newActivityName.toUpperCase(),
                pembina: teacher?.fullName || '',
                entries: Array.from({ length: 18 }, () => createEmptyEntry())
            };
            const newData = { ...extracurricularData, activities: [...extracurricularData.activities, newActivity] };
            await updateExtracurricularData(selectedYear, selectedClass, semester, newData, userId);
            setExtracurricularData(newData);
            setSelectedActivityId(newActivity.id);
            setNewActivityName('');
            setIsAdding(false);
            setNotification({ message: 'Kegiatan baru ditambahkan.', type: 'success' });
        } catch (error: any) {
            setNotification({ message: error.message, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteActivity = async (id: string) => {
        if (!window.confirm('Yakin ingin menghapus kegiatan ini?')) return;
        setIsSaving(true);
        try {
            const newData = { ...extracurricularData, activities: extracurricularData.activities.filter(a => a.id !== id) };
            await updateExtracurricularData(selectedYear, selectedClass, semester, newData, userId);
            setExtracurricularData(newData);
            if (newData.activities.length > 0) {
                setSelectedActivityId(newData.activities[0].id);
            } else {
                setSelectedActivityId('');
            }
            setNotification({ message: 'Kegiatan dihapus.', type: 'success' });
        } catch (error: any) {
            setNotification({ message: error.message, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleEntryChange = (entryIndex: number, field: keyof ExtracurricularEntry, value: string) => {
        setExtracurricularData(prev => {
            const activities = prev.activities.map(act => {
                if (act.id === selectedActivityId) {
                    const newEntries = [...act.entries];
                    newEntries[entryIndex] = { ...newEntries[entryIndex], [field]: value };
                    return { ...act, entries: newEntries };
                }
                return act;
            });
            return { activities };
        });
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateExtracurricularData(selectedYear, selectedClass, semester, extracurricularData, userId);
            setNotification({ message: 'Data berhasil disimpan.', type: 'success' });
        } catch (error: any) {
            setNotification({ message: error.message, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const currentActivity = extracurricularData.activities.find(a => a.id === selectedActivityId);

    const handleGenerateAI = async () => {
        if (!currentActivity) return;
        setIsGenerating(true);
        setNotification({ message: 'AI sedang menyusun 18 kegiatan (cek kalender pendidikan)...', type: 'info' });

        try {
            // Fetch calendar events to provide context about holidays
            const calendarEvents = await getCalendarEvents(selectedYear, userId);
            const holidayList = calendarEvents
                .filter(e => e.type === 'holiday')
                .map(e => `${e.date} (${e.description})`)
                .join('; ');

            const prompt = `
                Anda adalah pembina ekstrakurikuler SD profesional.
                Buatkan rencana kegiatan untuk ekstrakurikuler "${currentActivity.name}" selama satu semester.
                Target: Siswa SD Kelas ${selectedClass}.
                Semester: ${semester}. Tahun Ajaran: ${selectedYear}.
                
                Data Hari Libur Nasional & Sekolah (HINDARI tanggal-tanggal ini):
                ${holidayList}

                Instruksi:
                1. Buat TEPAT 18 materi/kegiatan yang variatif, menyenangkan, dan edukatif (sesuai 18 minggu efektif).
                2. **PENTING**: Format 'rencanaPelaksanaan' HARUS "Minggu ke-[Nomor] Bulan [Nama Bulan]" (Contoh: "Minggu ke-1 Bulan Juli"). JANGAN menyingkat menjadi "Minggu 1 Juli".
                3. Tentukan estimasi tanggal pelaksanaan (Format YYYY-MM-DD) yang logis untuk semester ${semester} tahun ${selectedYear}.
                   - Pilih satu hari tetap dalam seminggu (misalnya Sabtu atau Jumat sore).
                   - Pastikan tanggal TIDAK bertabrakan dengan daftar hari libur di atas. Jika kena libur, geser ke minggu depannya atau hari lain yang efektif.
                4. **PENTING**: HANYA isi kolom 'materi', 'rencanaPelaksanaan', dan 'tanggal'. JANGAN mengisi jumlah siswa, kehadiran, atau tanda tangan.
                
                Output JSON Array of Objects (Harus berisi 18 item):
                [
                  { "materi": "Pengenalan Dasar...", "rencanaPelaksanaan": "Minggu ke-1 Bulan Juli", "tanggal": "2025-07-15" },
                  ...
                ]
            `;

            const response = await generateContentWithRotation({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                materi: { type: Type.STRING },
                                rencanaPelaksanaan: { type: Type.STRING },
                                tanggal: { type: Type.STRING }
                            },
                            required: ["materi", "rencanaPelaksanaan", "tanggal"]
                        }
                    }
                }
            });

            const results = JSON.parse(response.text.trim());
            
            if (Array.isArray(results)) {
                setExtracurricularData(prev => {
                    const activities = prev.activities.map(act => {
                        if (act.id === selectedActivityId) {
                            // Ensure we have at least 18 rows, or overwrite existing ones
                            let newEntries = [...act.entries];
                            if (newEntries.length < 18) {
                                const extraNeeded = 18 - newEntries.length;
                                newEntries = [...newEntries, ...Array.from({length: extraNeeded}, () => createEmptyEntry())];
                            }

                            // Merge generated data
                            newEntries = newEntries.map((entry, idx) => {
                                if (idx < results.length) {
                                    return { 
                                        ...entry, 
                                        materi: results[idx].materi, 
                                        rencanaPelaksanaan: results[idx].rencanaPelaksanaan,
                                        tanggal: results[idx].tanggal,
                                        // Reset other fields to avoid stale data mixed with new AI data
                                        jmlSiswa: '', hadir: '', tidakHadir: '', keterangan: '', signature: ''
                                    };
                                }
                                return entry;
                            });
                            return { ...act, entries: newEntries };
                        }
                        return act;
                    });
                    return { activities };
                });
                setNotification({ message: '18 Kegiatan berhasil dibuat oleh AI menyesuaikan kalender.', type: 'success' });
            }

        } catch (error: any) {
            setNotification({ message: 'Gagal generate AI: ' + error.message, type: 'error' });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDownloadPDF = async (signatureOption: 'none' | 'teacher' | 'both') => {
        if (!schoolIdentity || !teacher || !currentActivity) {
            setNotification({ message: 'Data tidak lengkap.', type: 'error' });
            return;
        }

        setIsGeneratingPDF(true);
        setIsPdfDropdownOpen(false);
        setNotification({ message: 'Mempersiapkan PDF...', type: 'info' });
        await new Promise(r => setTimeout(r, 50));

        try {
            const { jsPDF } = jspdf;
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [330, 215] });

            const margin = { top: 20, right: 10, bottom: 10, left: 10 };
            const pageWidth = pdf.internal.pageSize.getWidth();
            let y = margin.top;

            // --- HEADER ---
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.text(`BUKU KEGIATAN EKSTRAKURIKULER ${currentActivity.name}`, pageWidth / 2, y, { align: 'center' });
            y += 6;
            pdf.setFontSize(12);
            pdf.text(`${schoolIdentity.schoolName.toUpperCase()}`, pageWidth / 2, y, { align: 'center' });
            y += 6;
            pdf.setFontSize(11);
            pdf.text(`KELAS ${selectedClass.toUpperCase().replace('KELAS ', '')} SEMESTER ${semester.toUpperCase()} TAHUN AJARAN ${selectedYear}`, pageWidth / 2, y, { align: 'center' });
            y += 10; 
            
            // --- TABLE ---
            const head = [
                [
                    { content: 'No.', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                    { content: 'Materi / Kegiatan', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                    { content: 'Rencana Pelaksanaan', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                    { content: 'Tanggal Dilaksanakan', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                    { content: 'Kehadiran', colSpan: 3, styles: { halign: 'center' } },
                    { content: 'Keterangan', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                    { content: 'TTD Pembina', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                ],
                [
                    { content: 'Jml', styles: { halign: 'center' } },
                    { content: 'Hadir', styles: { halign: 'center' } },
                    { content: 'Tdk', styles: { halign: 'center' } },
                ]
            ];
            
            const body = currentActivity.entries
                .filter(e => e.materi || e.tanggal || e.rencanaPelaksanaan) 
                .map((entry, index) => [
                    index + 1,
                    entry.materi,
                    entry.rencanaPelaksanaan,
                    entry.tanggal ? new Date(entry.tanggal).toLocaleDateString('id-ID') : '',
                    entry.jmlSiswa,
                    entry.hadir,
                    entry.tidakHadir,
                    entry.keterangan,
                    entry.signature
                ]);
            
            // If body is empty, fill with blanks
            if (body.length < 18) {
                const fillCount = 18 - body.length;
                for(let i=0; i<fillCount; i++) {
                    body.push(['', '', '', '', '', '', '', '', '']);
                }
            }

            (pdf as any).autoTable({
                head, 
                body, 
                startY: y, 
                theme: 'grid',
                headStyles: {
                    fillColor: [255, 255, 255], 
                    textColor: [0, 0, 0],       
                    fontStyle: 'bold',
                    halign: 'center', 
                    valign: 'middle', 
                    lineColor: 0, 
                    lineWidth: 0.1
                },
                styles: { 
                    fontSize: 9, 
                    lineColor: 0, 
                    lineWidth: 0.1, 
                    cellPadding: 1.5, 
                    valign: 'middle',
                    minCellHeight: 8
                },
                columnStyles: {
                    0: { cellWidth: 10, halign: 'center' },        // No.
                    1: { cellWidth: 90 },                           // Materi - Widened
                    2: { cellWidth: 50 },                           // Rencana
                    3: { cellWidth: 30, halign: 'center' },         // Tanggal
                    4: { cellWidth: 12, halign: 'center' },         // Jml - Reduced
                    5: { cellWidth: 12, halign: 'center' },         // Hadir - Reduced
                    6: { cellWidth: 12, halign: 'center' },         // Tdk - Reduced
                    7: { cellWidth: 55 },                           // Keterangan - Slightly Widened
                    8: { cellWidth: 35 },                           // TTD
                },
                margin: { left: margin.left, right: margin.right, bottom: margin.bottom }
            });
            
            y = (pdf as any).lastAutoTable.finalY + 15;
            
            if (y + 35 > pdf.internal.pageSize.getHeight() - margin.bottom) {
                pdf.addPage();
                y = margin.top;
            }

            // --- SIGNATURE ---
            if (signatureOption !== 'none') {
                const principalX = margin.left + 40; 
                const teacherX = pageWidth - margin.right - 50; // Shifted right
                const formattedDate = new Date(signatureDate + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'normal');

                if (signatureOption === 'both') {
                    pdf.text('Mengetahui,', principalX, y, { align: 'center' });
                    pdf.text('Kepala Sekolah', principalX, y + 5, { align: 'center' });
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(schoolIdentity.principalName, principalX, y + 25, { align: 'center' });
                    pdf.setLineWidth(0.2);
                    const principalWidth = pdf.getStringUnitWidth(schoolIdentity.principalName) * 10 / pdf.internal.scaleFactor;
                    pdf.line(principalX - principalWidth/2, y + 26, principalX + principalWidth/2, y + 26);
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${schoolIdentity.principalNip}`, principalX, y + 30, { align: 'center' });
                }
                
                if (signatureOption === 'teacher' || signatureOption === 'both') {
                    pdf.text(`${schoolIdentity.city || '.......'}, ${formattedDate}`, teacherX, y, { align: 'center' });
                    // Updated title from 'Pembina Ekstrakurikuler' to 'Guru Kelas ...'
                    pdf.text(`Guru Kelas ${selectedClass.replace('Kelas ', '')}`, teacherX, y + 5, { align: 'center' });
                    pdf.setFont('helvetica', 'bold');
                    // Use Teacher's name instead of Coach's name
                    const signingName = teacher.fullName;
                    pdf.text(signingName, teacherX, y + 25, { align: 'center' });
                    const signingWidth = pdf.getStringUnitWidth(signingName) * 10 / pdf.internal.scaleFactor;
                    pdf.line(teacherX - signingWidth/2, y + 26, teacherX + signingWidth/2, y + 26);
                    
                    pdf.setFont('helvetica', 'normal');
                    // Always show Teacher's NIP
                    pdf.text(`NIP. ${teacher.nip}`, teacherX, y + 30, { align: 'center' });
                }
            }

            pdf.save(`Jurnal-Ekstra-${currentActivity.name.replace(/\s+/g, '_')}.pdf`);
            setNotification({ message: 'PDF berhasil dibuat.', type: 'success' });

        } catch(e) {
            console.error(e);
            setNotification({ message: 'Gagal membuat PDF.', type: 'error' });
        } finally {
            setIsGeneratingPDF(false);
        }
    };
    
    if (isLoading) return <div className="text-center p-8">Memuat data...</div>;

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg">
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            
            {/* Header & Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div className="flex items-center space-x-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                    {extracurricularData.activities.map(act => (
                        <button
                            key={act.id}
                            onClick={() => setSelectedActivityId(act.id)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                                selectedActivityId === act.id 
                                ? 'bg-indigo-600 text-white shadow-md' 
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            {act.name}
                        </button>
                    ))}
                    <button 
                        onClick={() => setIsAdding(true)} 
                        className="px-3 py-2 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 text-sm flex items-center"
                    >
                        + Baru
                    </button>
                </div>

                <div className="flex items-center gap-2 self-end">
                    <label className="text-xs font-medium text-gray-700">Semester:</label>
                    <select
                        value={semester}
                        onChange={(e) => setSemester(e.target.value as 'Ganjil' | 'Genap')}
                        className="p-1 border rounded text-xs"
                    >
                        <option>Ganjil</option><option>Genap</option>
                    </select>
                </div>
            </div>

            {isAdding && (
                <div className="mb-6 p-4 bg-gray-50 border rounded-lg flex items-center gap-2">
                    <input 
                        type="text" 
                        value={newActivityName} 
                        onChange={e => setNewActivityName(e.target.value)} 
                        placeholder="Nama Ekstrakurikuler (Misal: FUTSAL)"
                        className="p-2 border rounded flex-1"
                    />
                    <button onClick={handleAddActivity} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">Simpan</button>
                    <button onClick={() => setIsAdding(false)} className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400">Batal</button>
                </div>
            )}

            {currentActivity ? (
                <>
                    <div className="flex justify-between items-center mb-4 border-b pb-4">
                        <div>
                            <h2 className="text-xl font-bold text-gray-800">BUKU KEGIATAN {currentActivity.name}</h2>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-sm text-gray-600">Pembina:</span>
                                <input 
                                    type="text" 
                                    value={currentActivity.pembina} 
                                    onChange={e => {
                                        const newVal = e.target.value;
                                        setExtracurricularData(prev => ({
                                            activities: prev.activities.map(a => a.id === currentActivity.id ? { ...a, pembina: newVal } : a)
                                        }));
                                    }}
                                    className="border-b border-gray-300 focus:border-indigo-500 focus:outline-none text-sm font-medium w-64"
                                    placeholder="Nama Pembina"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleGenerateAI} disabled={isGenerating} className="px-3 py-2 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 text-sm flex items-center gap-1">
                                <SparklesIcon className="w-4 h-4"/> Lengkapi AI
                            </button>
                            {currentActivity.name !== 'PRAMUKA' && (
                                <button onClick={() => handleDeleteActivity(currentActivity.id)} className="px-3 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm flex items-center gap-1">
                                    <TrashIcon className="w-4 h-4"/> Hapus
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 mb-4 items-center">
                        <div className="flex items-center gap-2 mr-2">
                            <label className="text-sm font-medium text-gray-700">Tanggal Cetak:</label>
                            <input
                                type="date"
                                value={signatureDate}
                                onChange={(e) => setSignatureDate(e.target.value)}
                                className="border border-gray-300 rounded-md p-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm">
                            {isSaving ? 'Menyimpan...' : 'Simpan Data'}
                        </button>
                        <div className="relative">
                            <button onClick={() => setIsPdfDropdownOpen(!isPdfDropdownOpen)} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm flex items-center gap-1">
                                <ArrowDownTrayIcon className="w-4 h-4"/> PDF
                            </button>
                            {isPdfDropdownOpen && (
                                <div className="absolute right-0 mt-2 w-48 bg-white rounded shadow-lg border z-10" onMouseLeave={() => setIsPdfDropdownOpen(false)}>
                                    <button onClick={() => handleDownloadPDF('none')} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100">Tanpa TTD</button>
                                    <button onClick={() => handleDownloadPDF('teacher')} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100">TTD Guru Kelas</button>
                                    <button onClick={() => handleDownloadPDF('both')} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100">TTD Guru & KS</button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="overflow-x-auto border rounded-lg shadow-sm">
                        <table className="min-w-full text-xs border-collapse">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="border p-2 w-8 text-center" rowSpan={2}>No</th>
                                    <th className="border p-2 min-w-[280px] text-left" rowSpan={2}>Materi / Kegiatan</th>
                                    <th className="border p-2 w-40 text-left" rowSpan={2}>Rencana Pelaksanaan</th>
                                    <th className="border p-2 w-32 text-center" rowSpan={2}>Tanggal</th>
                                    <th className="border p-2 text-center" colSpan={3}>Kehadiran</th>
                                    <th className="border p-2 w-48 text-left" rowSpan={2}>Keterangan</th>
                                    <th className="border p-2 w-32 text-center" rowSpan={2}>TTD Pembina</th>
                                </tr>
                                <tr>
                                    <th className="border p-1 w-12 text-center">Jml</th>
                                    <th className="border p-1 w-12 text-center">Hadir</th>
                                    <th className="border p-1 w-12 text-center">Tdk</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentActivity.entries.map((entry, index) => (
                                    <tr key={entry.id} className="hover:bg-gray-50">
                                        <td className="border p-2 text-center">{entry.materi ? index + 1 : ''}</td>
                                        <td className="border p-1">
                                            <WrappingTextarea value={entry.materi} onChange={e => handleEntryChange(index, 'materi', e.target.value)} disabled={false} className="min-h-[40px] text-xs" />
                                        </td>
                                        <td className="border p-1">
                                            <input type="text" value={entry.rencanaPelaksanaan} onChange={e => handleEntryChange(index, 'rencanaPelaksanaan', e.target.value)} className="w-full p-1 border-none bg-transparent focus:outline-none" placeholder="Minggu ke..."/>
                                        </td>
                                        <td className="border p-1">
                                            <input type="date" value={entry.tanggal} onChange={e => handleEntryChange(index, 'tanggal', e.target.value)} className="w-full p-1 border-none bg-transparent focus:outline-none"/>
                                        </td>
                                        <td className="border p-1"><input type="text" value={entry.jmlSiswa} onChange={e => handleEntryChange(index, 'jmlSiswa', e.target.value)} className="w-full text-center border-none bg-transparent focus:outline-none"/></td>
                                        <td className="border p-1"><input type="text" value={entry.hadir} onChange={e => handleEntryChange(index, 'hadir', e.target.value)} className="w-full text-center border-none bg-transparent focus:outline-none"/></td>
                                        <td className="border p-1"><input type="text" value={entry.tidakHadir} onChange={e => handleEntryChange(index, 'tidakHadir', e.target.value)} className="w-full text-center border-none bg-transparent focus:outline-none"/></td>
                                        <td className="border p-1">
                                            <WrappingTextarea value={entry.keterangan} onChange={e => handleEntryChange(index, 'keterangan', e.target.value)} disabled={false} className="min-h-[40px] text-xs" />
                                        </td>
                                        <td className="border p-1">
                                            <input type="text" value={entry.signature} onChange={e => handleEntryChange(index, 'signature', e.target.value)} className="w-full p-1 border-none bg-transparent focus:outline-none text-center"/>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            ) : (
                <div className="text-center py-20 text-gray-500">
                    Pilih atau tambahkan kegiatan ekstrakurikuler.
                </div>
            )}
        </div>
    );
};

export default ExtracurricularBook;
