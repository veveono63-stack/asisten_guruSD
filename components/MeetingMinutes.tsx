
import React, { useState, useEffect } from 'react';
import { MeetingMinutesData, MeetingMinuteEntry, Teacher, SchoolIdentity } from '../types';
import { getMeetingMinutes, updateMeetingMinutes, getTeacherProfile, getSchoolIdentity } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { PencilIcon, TrashIcon, ArrowDownTrayIcon } from './Icons';

declare const jspdf: any;

interface MeetingMinutesProps {
    selectedClass: string;
    selectedYear: string;
    userId?: string;
}

// Menyamakan dengan standar Admin: 25 Baris
const DEFAULT_ROW_COUNT = 25; 

const MeetingMinutes: React.FC<MeetingMinutesProps> = ({ selectedClass, selectedYear, userId }) => {
    const [semester, setSemester] = useState<'Ganjil' | 'Genap'>('Ganjil');
    const [entries, setEntries] = useState<MeetingMinuteEntry[]>([]);
    const [originalEntries, setOriginalEntries] = useState<MeetingMinuteEntry[] | null>(null);
    const [teacher, setTeacher] = useState<Teacher | null>(null);
    const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);
    const [signatureDate, setSignatureDate] = useState(new Date().toISOString().split('T')[0]);
    const [isPdfDropdownOpen, setIsPdfDropdownOpen] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

    const createEmptyEntry = (): MeetingMinuteEntry => ({
        id: `new-${Date.now()}-${Math.random()}`,
        dateTime: '',
        agenda: '',
        presenter: '',
        details: '',
    });

    const padEntries = (entries: MeetingMinuteEntry[]): MeetingMinuteEntry[] => {
        const needed = DEFAULT_ROW_COUNT - entries.length;
        if (needed > 0) {
            return [...entries, ...Array.from({ length: needed }, createEmptyEntry)];
        }
        return entries;
    };

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            setIsEditing(false);
            try {
                // Menggunakan userId untuk database privat guru
                const [minutes, teacherProfile, identity] = await Promise.all([
                    getMeetingMinutes(selectedYear, selectedClass, semester, userId),
                    getTeacherProfile(selectedYear, selectedClass, userId),
                    getSchoolIdentity(userId)
                ]);
                
                setEntries(padEntries(minutes.entries));
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

    const handleEdit = () => {
        setOriginalEntries(JSON.parse(JSON.stringify(entries)));
        setIsEditing(true);
    };

    const handleCancel = () => {
        if (originalEntries) setEntries(originalEntries);
        setIsEditing(false);
    };

    const handleSave = async () => {
        if (!entries) return;
        setIsSaving(true);
        setNotification(null);
        try {
            const dataToSave: MeetingMinutesData = {
                entries: entries.filter(e => 
                    e.dateTime || e.agenda || e.presenter || e.details
                )
            };
            await updateMeetingMinutes(selectedYear, selectedClass, semester, dataToSave, userId);
            setEntries(padEntries(dataToSave.entries));
            setNotification({ message: 'Data notulen rapat berhasil disimpan.', type: 'success' });
            setIsEditing(false);
        } catch (error: any) {
            setNotification({ message: error.message, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleEntryChange = (index: number, field: keyof Omit<MeetingMinuteEntry, 'id'>, value: string) => {
        if (!entries) return;
        const newEntries = [...entries];
        (newEntries[index] as any)[field] = value;
        setEntries(newEntries);
    };
    
    const handleAddRow = () => {
        if (!entries) return;
        setEntries([...entries, createEmptyEntry()]);
    };

    const handleRemoveRow = (id: string) => {
        if (!entries) return;
        setEntries(entries.filter(entry => entry.id !== id));
    };
    
    const handleDownloadPDF = async (signatureOption: 'none' | 'teacher' | 'both') => {
        if (!entries || !schoolIdentity || !teacher) {
            setNotification({ message: 'Data tidak lengkap untuk membuat PDF.', type: 'error' });
            return;
        }

        setIsGeneratingPDF(true);
        setIsPdfDropdownOpen(false);
        setNotification({ message: 'Mempersiapkan PDF...', type: 'info' });
        await new Promise(r => setTimeout(r, 50));

        try {
            const { jsPDF } = jspdf;
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [330, 215] });

            // Margins: Kiri 15mm (untuk jilid), Atas 15mm, Lainnya 10mm
            const margin = { top: 15, left: 15, right: 10, bottom: 10 };
            const pageWidth = pdf.internal.pageSize.getWidth();
            let y = margin.top;

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            pdf.text(`NOTULEN RAPAT KELAS ${selectedClass.toUpperCase().replace('KELAS ', '')}`, pageWidth / 2, y, { align: 'center' });
            y += 6;
            pdf.text(schoolIdentity.schoolName.toUpperCase(), pageWidth / 2, y, { align: 'center' });
            y += 6;
            pdf.text(`SEMESTER ${semester.toUpperCase()} TAHUN AJARAN ${selectedYear}`, pageWidth / 2, y, { align: 'center' });
            y += 10;
            
            const head = [['No.', 'Hari/Tanggal', 'Acara', 'Penyampai', 'Uraian/Kesimpulan']];
            
            // Jika ada TTD, kurangi baris kosong agar muat 1 halaman (mengikuti logika supervisi)
            const targetRowCount = signatureOption === 'none' ? DEFAULT_ROW_COUNT : DEFAULT_ROW_COUNT - 7;
            
            const actualData = entries.filter(e => e.dateTime || e.agenda || e.presenter || e.details);
            const pdfEntries = [...actualData];
            while (pdfEntries.length < targetRowCount) {
                pdfEntries.push(createEmptyEntry());
            }
            const limitedEntries = pdfEntries.length > targetRowCount && actualData.length > targetRowCount 
                ? actualData 
                : pdfEntries.slice(0, Math.max(targetRowCount, actualData.length));

            let body = limitedEntries
                .map((entry, index) => {
                    const hasContent = entry.dateTime || entry.agenda || entry.presenter || entry.details;
                    return [
                        hasContent ? index + 1 : '',
                        entry.dateTime,
                        entry.agenda,
                        entry.presenter,
                        entry.details,
                    ]
                });
            
            (pdf as any).autoTable({
                head, body, startY: y, theme: 'grid',
                headStyles: {
                    fillColor: [229, 231, 235], textColor: [0, 0, 0], fontStyle: 'bold',
                    halign: 'center', valign: 'middle', lineColor: 0, lineWidth: 0.1, fontSize: 8
                },
                styles: { fontSize: 8, lineColor: 0, lineWidth: 0.1, cellPadding: 1, valign: 'top' },
                bodyStyles: {
                    minCellHeight: 6.2 // Tinggi baris standar 6.2mm (sama dengan tabungan)
                },
                columnStyles: {
                    0: { cellWidth: 8, halign: 'center' },        // No.
                    1: { cellWidth: 35 },                           // Hari/Tanggal
                    2: { cellWidth: 45 },                           // Acara
                    3: { cellWidth: 45 },                           // Penyampai
                    4: { cellWidth: 'auto' },                       // Uraian/Kesimpulan
                },
                margin: { left: margin.left, right: margin.right, bottom: margin.bottom }
            });
            
            y = (pdf as any).lastAutoTable.finalY + 10;
            
            const pageHeight = pdf.internal.pageSize.getHeight();
            if (y > pageHeight - 40) {
                pdf.addPage();
                y = margin.top + 10;
            }

            if (signatureOption !== 'none') {
                const principalX = margin.left + 50;
                const teacherX = pageWidth - margin.right - 50;
                const signatureY = y;
                const formattedDate = new Date(signatureDate + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'normal');

                if (signatureOption === 'both') {
                    pdf.text('Mengetahui,', principalX, signatureY, { align: 'center' });
                    pdf.text('Kepala Sekolah', principalX, signatureY + 5, { align: 'center' });
                    
                    const principalName = schoolIdentity.principalName || '.....................................';
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(principalName, principalX, signatureY + 25, { align: 'center' });
                    const principalNameWidth = pdf.getStringUnitWidth(principalName) * pdf.internal.getFontSize() / pdf.internal.scaleFactor;
                    pdf.setLineWidth(0.2);
                    pdf.line(principalX - principalNameWidth / 2, signatureY + 25.5, principalX + principalNameWidth / 2, signatureY + 25.5);
                    
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${schoolIdentity.principalNip || '...................'}`, principalX, signatureY + 30, { align: 'center' });
                }
                
                if (signatureOption === 'teacher' || signatureOption === 'both') {
                    pdf.text(`${schoolIdentity.city || '...................'}, ${formattedDate}`, teacherX, signatureY, { align: 'center' });
                    pdf.text(`Guru ${selectedClass}`, teacherX, signatureY + 5, { align: 'center' });
                    
                    const teacherName = teacher.fullName || '.....................................';
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(teacherName, teacherX, signatureY + 25, { align: 'center' });
                    const teacherNameWidth = pdf.getStringUnitWidth(teacherName) * pdf.internal.getFontSize() / pdf.internal.scaleFactor;
                    pdf.setLineWidth(0.2);
                    pdf.line(teacherX - teacherNameWidth / 2, signatureY + 25.5, teacherX + teacherNameWidth / 2, signatureY + 25.5);
                    
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${teacher.nip || '...................'}`, teacherX, signatureY + 30, { align: 'center' });
                }
            }

            pdf.save(`Notulen-Rapat-${selectedClass.replace(' ', '_')}-${selectedYear.replace('/', '-')}.pdf`);
            setNotification({ message: 'PDF berhasil dibuat.', type: 'success' });

        } catch(e) {
            console.error(e);
            setNotification({ message: 'Gagal membuat PDF.', type: 'error' });
        } finally {
            setIsGeneratingPDF(false);
        }
    };
    
    if (isLoading) return <div className="text-center p-8">Memuat data notulen...</div>;
    if (!entries) return <div className="text-center p-8 text-red-500">Gagal memuat data.</div>;

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg">
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-xl font-bold uppercase text-gray-800">
                        NOTULEN RAPAT KELAS {selectedClass.toUpperCase().replace('KELAS ', '')}
                    </h2>
                    <p className="text-sm font-semibold text-gray-600 uppercase">{schoolIdentity?.schoolName} - T.A {selectedYear}</p>
                </div>
                <div className="flex items-center space-x-2">
                    {isEditing ? (
                        <>
                            <button onClick={handleCancel} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold transition-colors">Batal</button>
                            <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold shadow disabled:bg-indigo-400 transition-colors">
                                {isSaving ? 'Menyimpan...' : 'Simpan'}
                            </button>
                        </>
                    ) : (
                        <>
                            <label htmlFor="signatureDate" className="text-sm font-medium text-gray-700 shrink-0">Cetak:</label>
                            <input
                                type="date"
                                id="signatureDate"
                                value={signatureDate}
                                onChange={(e) => setSignatureDate(e.target.value)}
                                className="block w-auto px-2 py-1 border border-gray-300 rounded-md shadow-sm sm:text-sm"
                            />
                            <div className="relative">
                                <button
                                    onClick={() => setIsPdfDropdownOpen(!isPdfDropdownOpen)}
                                    disabled={isGeneratingPDF || isSaving}
                                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-semibold shadow flex items-center space-x-2 disabled:bg-gray-400 transition-colors"
                                >
                                    <ArrowDownTrayIcon className="w-4 h-4"/> <span>{isGeneratingPDF ? '...' : 'PDF'}</span>
                                </button>
                                {isPdfDropdownOpen && (
                                    <div
                                        className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border"
                                        onMouseLeave={() => setIsPdfDropdownOpen(false)}
                                    >
                                        <ul className="py-1">
                                            <li><button onClick={() => handleDownloadPDF('none')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Tanpa TTD</button></li>
                                            <li><button onClick={() => handleDownloadPDF('teacher')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">TTD Guru</button></li>
                                            <li><button onClick={() => handleDownloadPDF('both')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">TTD Guru & KS</button></li>
                                        </ul>
                                    </div>
                                )}
                            </div>
                            <button onClick={handleEdit} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold shadow flex items-center space-x-2 transition-colors"><PencilIcon className="w-4 h-4"/> <span>Edit</span></button>
                        </>
                    )}
                </div>
            </div>

            <div className="mb-6 flex items-center space-x-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <label className="font-bold text-gray-700">Pilih Semester:</label>
                <select
                    value={semester}
                    onChange={(e) => setSemester(e.target.value as 'Ganjil' | 'Genap')}
                    className="p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    disabled={isEditing}
                >
                    <option>Ganjil</option>
                    <option>Genap</option>
                </select>
                {isEditing && (
                    <button onClick={handleAddRow} className="text-sm text-indigo-600 hover:text-indigo-800 font-bold ml-auto">
                        + Tambah Baris Manual
                    </button>
                )}
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-xl shadow-sm bg-white">
                <table className="w-full text-xs border-collapse">
                    <thead className="bg-gray-100 text-center font-bold text-gray-700">
                        <tr>
                            <th className="border border-gray-200 p-2 w-10">No.</th>
                            <th className="border border-gray-200 p-2 min-w-[150px]">Hari/Tanggal</th>
                            <th className="border border-gray-200 p-2 min-w-[200px]">Acara</th>
                            <th className="border border-gray-200 p-2 min-w-[150px]">Penyampai</th>
                            <th className="border border-gray-200 p-2">Uraian / Kesimpulan</th>
                            {isEditing && <th className="border border-gray-200 p-2 w-12"></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((entry, index) => (
                            <tr key={entry.id} className="hover:bg-indigo-50/30 align-top transition-colors">
                                <td className="border border-gray-200 p-2 text-center text-gray-500">{(entry.dateTime || entry.agenda || entry.presenter || entry.details) ? index + 1 : ''}</td>
                                <td className="border border-gray-200 p-0">
                                    <textarea 
                                        value={entry.dateTime} 
                                        onChange={e => handleEntryChange(index, 'dateTime', e.target.value)} 
                                        className="w-full h-full p-2 border-none bg-transparent focus:ring-0 resize-none overflow-hidden" 
                                        rows={1} 
                                        disabled={!isEditing} 
                                        placeholder={isEditing ? 'Hari/Tgl...' : ''}
                                    />
                                </td>
                                <td className="border border-gray-200 p-0">
                                    <textarea 
                                        value={entry.agenda} 
                                        onChange={e => handleEntryChange(index, 'agenda', e.target.value)} 
                                        className="w-full h-full p-2 border-none bg-transparent focus:ring-0 resize-none overflow-hidden font-semibold" 
                                        rows={1} 
                                        disabled={!isEditing} 
                                        placeholder={isEditing ? 'Agenda...' : ''}
                                    />
                                </td>
                                <td className="border border-gray-200 p-0">
                                    <textarea 
                                        value={entry.presenter} 
                                        onChange={e => handleEntryChange(index, 'presenter', e.target.value)} 
                                        className="w-full h-full p-2 border-none bg-transparent focus:ring-0 resize-none overflow-hidden" 
                                        rows={1} 
                                        disabled={!isEditing} 
                                        placeholder={isEditing ? 'Penyampai...' : ''}
                                    />
                                </td>
                                <td className="border border-gray-200 p-0">
                                    <textarea 
                                        value={entry.details} 
                                        onChange={e => handleEntryChange(index, 'details', e.target.value)} 
                                        className="w-full h-full p-2 border-none bg-transparent focus:ring-0 resize-none overflow-hidden" 
                                        rows={1} 
                                        disabled={!isEditing} 
                                        placeholder={isEditing ? 'Uraian...' : ''}
                                    />
                                </td>
                                {isEditing && (
                                    <td className="border border-gray-200 p-1 text-center align-middle">
                                        <button onClick={() => handleRemoveRow(entry.id)} className="p-1 text-red-500 hover:text-red-700 transition-colors">
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default MeetingMinutes;
