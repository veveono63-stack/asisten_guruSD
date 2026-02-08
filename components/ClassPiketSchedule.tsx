
import React, { useState, useEffect, useMemo } from 'react';
import { PiketScheduleData, Student, Teacher, SchoolIdentity } from '../types';
import { getPiketSchedule, updatePiketSchedule, getStudents, getTeacherProfile, getSchoolIdentity } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { PencilIcon, TrashIcon, ArrowDownTrayIcon, UserPlusIcon, SparklesIcon } from './Icons';
import AutocompleteInput from './AutocompleteInput';
import { Type } from '@google/genai';
import { generateContentWithRotation } from '../services/geminiService';

declare const jspdf: any;

interface ClassPiketScheduleProps {
    selectedClass: string;
    selectedYear: string;
    userId?: string;
}

const ClassPiketSchedule: React.FC<ClassPiketScheduleProps> = ({ selectedClass, selectedYear, userId }) => {
    const [schedule, setSchedule] = useState<PiketScheduleData | null>(null);
    const [students, setStudents] = useState<Student[]>([]);
    const [teacher, setTeacher] = useState<Teacher | null>(null);
    const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);
    const [signatureDate, setSignatureDate] = useState(new Date().toISOString().split('T')[0]);
    const [isPdfDropdownOpen, setIsPdfDropdownOpen] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

    const days: (keyof Omit<PiketScheduleData, 'quota'>)[] = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            setNotification(null);
            try {
                const [scheduleData, studentData, teacherData, identityData] = await Promise.all([
                    getPiketSchedule(selectedYear, selectedClass, userId),
                    getStudents(selectedYear, selectedClass, userId),
                    getTeacherProfile(selectedYear, selectedClass, userId),
                    getSchoolIdentity(userId),
                ]);
                setSchedule(scheduleData);
                // PERBAIKAN: Hanya filter baris yang benar-benar kosong (tidak ada nama lengkap)
                setStudents(studentData.filter(s => s.fullName && s.fullName.trim() !== '')); 
                setTeacher(teacherData);
                setSchoolIdentity(identityData);
            } catch (error: any) {
                setNotification({ message: error.message || 'Gagal memuat data.', type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [selectedClass, selectedYear, userId]);

    // PERBAIKAN: Gunakan nickname jika ada, jika tidak gunakan fullName untuk opsi dropdown
    const studentNicknames = useMemo(() => 
        students.map(s => s.nickname && s.nickname.trim() !== '' ? s.nickname : s.fullName).sort()
    , [students]);

    const picketUsage = useMemo(() => {
        if (!schedule) return new Map<string, number>();
        const usage = new Map<string, number>();
        days.forEach(day => {
            if (schedule[day]) {
                schedule[day].forEach(name => {
                    if (name) {
                        usage.set(name, (usage.get(name) || 0) + 1);
                    }
                });
            }
        });
        return usage;
    }, [schedule]);

    const handleGenerateWithAI = async () => {
        if (!schedule || studentNicknames.length === 0) {
            setNotification({ message: 'Tidak ada siswa yang tersedia untuk dibuatkan jadwal. Pastikan "Daftar Siswa" sudah diisi.', type: 'error' });
            return;
        }

        setIsGenerating(true);
        setNotification({ message: 'AI sedang membuat jadwal piket, mohon tunggu...', type: 'info' });

        try {
            const prompt = `
                Anda adalah asisten cerdas yang bertugas membuat jadwal piket kebersihan kelas yang adil dan acak.
                
                Tugas Anda:
                Buat jadwal piket untuk hari Senin, Selasa, Rabu, Kamis, Jumat, dan Sabtu.

                Aturan yang harus diikuti:
                1. Daftar siswa: ${studentNicknames.join(', ')}.
                2. Setiap siswa HARUS mendapatkan jadwal piket sebanyak ${schedule.quota} kali dalam seminggu. Tidak boleh lebih atau kurang.
                3. Distribusikan siswa secara acak ke dalam jadwal harian.
                4. Usahakan jumlah siswa yang piket setiap harinya seimbang.
                5. Satu siswa tidak boleh piket lebih dari satu kali pada hari yang sama.

                Format output:
                Berikan jawaban HANYA dalam format JSON yang valid sesuai dengan skema yang diberikan, tanpa teks tambahan atau penjelasan.
            `;
            
            const schema = {
                type: Type.OBJECT,
                properties: {
                    senin: { type: Type.ARRAY, items: { type: Type.STRING } },
                    selasa: { type: Type.ARRAY, items: { type: Type.STRING } },
                    rabu: { type: Type.ARRAY, items: { type: Type.STRING } },
                    kamis: { type: Type.ARRAY, items: { type: Type.STRING } },
                    jumat: { type: Type.ARRAY, items: { type: Type.STRING } },
                    sabtu: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu']
            };

            const response = await generateContentWithRotation({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: schema,
                },
            });

            const jsonText = response.text.trim();
            const generatedSchedule = JSON.parse(jsonText);

            if (typeof generatedSchedule === 'object' && generatedSchedule !== null && 'senin' in generatedSchedule) {
                setSchedule(prev => ({ ...prev!, ...generatedSchedule }));
                setNotification({ message: 'Jadwal piket berhasil dibuat oleh AI!', type: 'success' });
            } else {
                 throw new Error('Format respons AI tidak valid.');
            }

        } catch (error) {
            console.error("AI Generation Error:", error);
            setNotification({ message: 'Gagal menghasilkan jadwal dengan AI. Silakan coba lagi.', type: 'error' });
        } finally {
            setIsGenerating(false);
        }
    };


    const handleAddStudent = (day: keyof Omit<PiketScheduleData, 'quota'>) => {
        if (!schedule) return;
        setSchedule(prev => ({
            ...prev!,
            [day]: [...(prev![day] || []), '']
        }));
    };

    const handleStudentChange = (day: keyof Omit<PiketScheduleData, 'quota'>, index: number, newName: string) => {
        if (!schedule) return;
        const updatedDaySchedule = [...schedule[day]];
        updatedDaySchedule[index] = newName;
        setSchedule(prev => ({ ...prev!, [day]: updatedDaySchedule }));
    };

    const handleRemoveStudent = (day: keyof Omit<PiketScheduleData, 'quota'>, index: number) => {
        if (!schedule) return;
        setSchedule(prev => ({
            ...prev!,
            [day]: prev![day].filter((_, i) => i !== index)
        }));
    };

    const handleSave = async () => {
        if (!schedule) return;
        setIsSaving(true);
        setNotification(null);
        try {
            await updatePiketSchedule(selectedYear, selectedClass, schedule, userId);
            setNotification({ message: 'Jadwal piket berhasil disimpan.', type: 'success' });
            setIsEditing(false);
        } catch (error: any) {
            setNotification({ message: error.message || 'Gagal menyimpan data.', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleDownloadPDF = async (signatureOption: 'none' | 'teacher' | 'both') => {
        setIsGeneratingPDF(true);
        setIsPdfDropdownOpen(false);
        setNotification({ message: 'Mempersiapkan PDF...', type: 'info' });
        await new Promise(resolve => setTimeout(resolve, 50));

        if (!schedule || !schoolIdentity || !teacher) {
            setNotification({ message: 'Gagal membuat PDF: Data tidak lengkap.', type: 'error' });
            setIsGeneratingPDF(false);
            return;
        }

        try {
            const { jsPDF } = jspdf;
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [330, 215] });
            
            const margin = { top: 25, right: 10, bottom: 10, left: 10 };
            const pageWidth = pdf.internal.pageSize.getWidth();
            let y = margin.top;

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.text(`JADWAL PIKET KEBERSIHAN ${selectedClass.toUpperCase()}`, pageWidth / 2, y, { align: 'center' });
            y += 7;
            pdf.setFontSize(12);
            pdf.text(schoolIdentity.schoolName.toUpperCase(), pageWidth / 2, y, { align: 'center' });
            y += 6;
            pdf.text(`TAHUN AJARAN ${selectedYear}`, pageWidth / 2, y, { align: 'center' });
            y += 10;

            const head = [['SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUM\'AT', 'SABTU']];
            const maxRows = Math.max(...days.map(day => schedule[day]?.length || 0));
            const body = [];
            for (let i = 0; i < maxRows; i++) {
                const row = days.map(day => (schedule[day]?.[i] || ''));
                body.push(row);
            }

            (pdf as any).autoTable({
                head: head,
                body: body,
                startY: y,
                theme: 'grid',
                headStyles: {
                    fillColor: [224, 231, 255],
                    textColor: [0, 0, 0],
                    fontStyle: 'bold',
                    halign: 'center',
                    valign: 'middle',
                    lineColor: [0, 0, 0],
                    lineWidth: 0.1,
                },
                styles: {
                    fontSize: 10,
                    cellPadding: 3,
                    lineColor: [0, 0, 0],
                    lineWidth: 0.1,
                    textColor: [0, 0, 0],
                },
                bodyStyles: {
                    minCellHeight: 10,
                    halign: 'center',
                    valign: 'middle',
                }
            });

            y = (pdf as any).lastAutoTable.finalY + 20;

            if (signatureOption !== 'none') {
                const pageHeight = pdf.internal.pageSize.getHeight();
                if (y > pageHeight - 50) pdf.addPage();
                
                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'normal');
                const formattedDate = new Date(signatureDate + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

                if (signatureOption === 'both') {
                    const principalX = 82.5; 
                    const teacherX = 247.5; 

                    pdf.text('Mengetahui,', principalX, y, { align: 'center' });
                    pdf.text('Kepala Sekolah', principalX, y + 5, { align: 'center' });
                    
                    const principalName = schoolIdentity.principalName;
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(principalName, principalX, y + 25, { align: 'center' });
                    const principalNameWidth = pdf.getStringUnitWidth(principalName) * pdf.internal.getFontSize() / pdf.internal.scaleFactor;
                    pdf.setLineWidth(0.2);
                    pdf.line(principalX - principalNameWidth / 2, y + 25.5, principalX + principalNameWidth / 2, y + 25.5);
                    
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${schoolIdentity.principalNip}`, principalX, y + 30, { align: 'center' });

                    pdf.text(`${schoolIdentity.city || '...................'}, ${formattedDate}`, teacherX, y, { align: 'center' });
                    pdf.text(`Wali ${selectedClass}`, teacherX, y + 5, { align: 'center' });

                    const teacherName = teacher.fullName;
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(teacherName, teacherX, y + 25, { align: 'center' });
                    const teacherNameWidth = pdf.getStringUnitWidth(teacherName) * pdf.internal.getFontSize() / pdf.internal.scaleFactor;
                    pdf.setLineWidth(0.2);
                    pdf.line(teacherX - teacherNameWidth / 2, y + 25.5, teacherX + teacherNameWidth / 2, y + 25.5);

                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${teacher.nip}`, teacherX, y + 30, { align: 'center' });

                } else if (signatureOption === 'teacher') {
                    const teacherX = 247.5; 
                    pdf.text(`${schoolIdentity.city || '...................'}, ${formattedDate}`, teacherX, y, { align: 'center' });
                    pdf.text(`Wali ${selectedClass}`, teacherX, y + 5, { align: 'center' });

                    const teacherName = teacher.fullName;
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(teacherName, teacherX, y + 25, { align: 'center' });
                    const teacherNameWidth = pdf.getStringUnitWidth(teacherName) * pdf.internal.getFontSize() / pdf.internal.scaleFactor;
                    pdf.setLineWidth(0.2);
                    pdf.line(teacherX - teacherNameWidth / 2, y + 25.5, teacherX + teacherNameWidth / 2, y + 25.5);
                    
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${teacher.nip}`, teacherX, y + 30, { align: 'center' });
                }
            }

            pdf.save(`Jadwal-Piket-${selectedClass.replace(' ', '_')}-${selectedYear.replace('/', '-')}.pdf`);
            setNotification({ message: 'PDF berhasil dibuat.', type: 'success' });
        } catch (error) {
            console.error(error);
            setNotification({ message: 'Gagal membuat PDF.', type: 'error' });
        } finally {
            setIsGeneratingPDF(false);
        }
    };
    
    if (isLoading) return <div className="text-center p-8">Memuat jadwal piket...</div>;
    if (!schedule || !teacher || !schoolIdentity) return <div className="text-center p-8 text-red-500">Gagal memuat data penting.</div>;
    
    const maxRows = Math.max(...days.map(day => schedule[day]?.length || 0), isEditing ? 0 : 5);

    const renderTableBody = () => {
        const rows = [];
        for (let i = 0; i < maxRows; i++) {
            rows.push(
                <tr key={i}>
                    {days.map(day => (
                        <td key={day} className="border p-2 align-middle text-center" style={{ verticalAlign: 'middle' }}>
                            {isEditing ? (
                                <>
                                    {(schedule[day]?.[i] !== undefined) && (
                                        <div className="flex items-center">
                                            <AutocompleteInput
                                                value={schedule[day][i]}
                                                onChange={newName => handleStudentChange(day, i, newName)}
                                                onSelect={newName => handleStudentChange(day, i, newName)}
                                                options={studentNicknames}
                                                placeholder="Nama Siswa"
                                                className="w-full text-sm"
                                            />
                                            <button onClick={() => handleRemoveStudent(day, i)} className="ml-2 text-red-500 hover:text-red-700 p-1"><TrashIcon className="w-4 h-4" /></button>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <span className="block min-h-[24px]">{schedule[day]?.[i] || ''}</span>
                            )}
                        </td>
                    ))}
                </tr>
            );
        }
        return rows;
    };

    const renderUsageSummary = () => {
        // PERBAIKAN: Urutkan berdasarkan Nama Panggilan (fallback Nama Lengkap)
        const sortedDisplayStudents = [...students].sort((a, b) => {
            const nameA = a.nickname && a.nickname.trim() !== '' ? a.nickname : a.fullName;
            const nameB = b.nickname && b.nickname.trim() !== '' ? b.nickname : b.fullName;
            return nameA.localeCompare(nameB);
        });

        if (sortedDisplayStudents.length === 0 && !isEditing) {
            return <p className="text-center text-gray-500 mt-4">Data siswa belum diisi pada menu Daftar Siswa.</p>;
        }
        
        const jatah = schedule?.quota || 1;

        return (
            <div className="mt-6 p-4 border rounded-lg bg-gray-50">
                <h3 className="text-lg font-semibold text-gray-700 mb-3">
                    Ringkasan Jadwal Piket Siswa (Jatah per Siswa: {jatah} hari)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 text-sm">
                    {sortedDisplayStudents.map(student => {
                        const displayName = student.nickname && student.nickname.trim() !== '' ? student.nickname : student.fullName;
                        const assignedCount = picketUsage.get(displayName) || 0;
                        const isMismatched = assignedCount !== jatah;
                        
                        return (
                            <div key={student.id} className={`p-2 rounded border transition-colors duration-200 ${isMismatched ? 'bg-red-100 border-red-300 text-red-800' : 'bg-green-100 border-green-300 text-green-800'}`}>
                                <p className="font-bold truncate" title={student.fullName}>{displayName}</p>
                                <p>Ditugaskan: {assignedCount} hari</p>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg">
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            
            <div className="flex flex-col lg:flex-row justify-between items-center mb-4 gap-4">
                <div className="text-center lg:text-left">
                    <h2 className="text-xl font-bold text-gray-800">JADWAL PIKET KEBERSIHAN {selectedClass.toUpperCase()}</h2>
                    <p className="text-sm font-semibold text-gray-700">{schoolIdentity.schoolName.toUpperCase()} - T.A {selectedYear}</p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 flex-shrink-0">
                    {isEditing ? (
                        <>
                            <button
                                onClick={handleGenerateWithAI}
                                disabled={isGenerating || isSaving || studentNicknames.length === 0}
                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold shadow flex items-center space-x-2 disabled:bg-purple-300 disabled:cursor-not-allowed"
                            >
                                {isGenerating ? (
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                ) : (
                                    <SparklesIcon />
                                )}
                                <span>{isGenerating ? 'Memproses...' : 'Generate AI'}</span>
                            </button>
                            <div className="flex items-center space-x-2">
                                <label htmlFor="piketJatah" className="text-sm font-medium text-gray-700 shrink-0">Jatah:</label>
                                <input
                                    type="number"
                                    id="piketJatah"
                                    value={schedule.quota}
                                    onChange={(e) => {
                                        const value = parseInt(e.target.value, 10);
                                        if (!isNaN(value) && value >= 0) {
                                            setSchedule(prev => ({ ...prev!, quota: value }));
                                        }
                                    }}
                                    className="block w-16 px-2 py-1 border border-gray-300 rounded-md shadow-sm sm:text-sm"
                                    min="0"
                                />
                            </div>
                            <button onClick={() => setIsEditing(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold">Batal</button>
                            <button onClick={handleSave} disabled={isSaving || isGenerating} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold disabled:bg-indigo-400">{isSaving ? 'Saving...' : 'Simpan'}</button>
                        </>
                    ) : (
                        <>
                            <label htmlFor="signatureDate" className="text-sm font-medium text-gray-700 shrink-0">Cetak:</label>
                            <input type="date" id="signatureDate" value={signatureDate} onChange={(e) => setSignatureDate(e.target.value)} className="block w-auto px-2 py-1 border border-gray-300 rounded-md shadow-sm sm:text-sm"/>
                            <div className="relative">
                                <button onClick={() => setIsPdfDropdownOpen(!isPdfDropdownOpen)} disabled={isGeneratingPDF} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-semibold shadow flex items-center space-x-2 disabled:bg-gray-400">
                                    <ArrowDownTrayIcon className="w-5 h-5"/> <span>{isGeneratingPDF ? '...' : 'PDF'}</span>
                                </button>
                                {isPdfDropdownOpen && (
                                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border" onMouseLeave={() => setIsPdfDropdownOpen(false)}>
                                        <ul className="py-1">
                                            <li><button onClick={() => handleDownloadPDF('none')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Tanpa TTD</button></li>
                                            <li><button onClick={() => handleDownloadPDF('teacher')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">TTD Wali Kelas</button></li>
                                            <li><button onClick={() => handleDownloadPDF('both')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">TTD Wali Kelas & KS</button></li>
                                        </ul>
                                    </div>
                                )}
                            </div>
                            <button onClick={() => setIsEditing(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold shadow flex items-center space-x-2"><PencilIcon className="w-5 h-5" /> <span>Edit</span></button>
                        </>
                    )}
                </div>
            </div>

            <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-full text-sm">
                    <thead className="bg-indigo-100 uppercase text-center">
                        <tr>
                            {days.map(day => <th key={day} className="p-3 border font-semibold">{day === 'jumat' ? "JUM'AT" : day.toUpperCase()}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {renderTableBody()}
                        {isEditing && (
                            <tr>
                                {days.map(day => (
                                    <td key={`add-${day}`} className="border p-2">
                                        <button onClick={() => handleAddStudent(day)} className="w-full text-sm text-indigo-600 hover:text-indigo-800 font-semibold flex items-center justify-center space-x-1">
                                            <UserPlusIcon className="w-4 h-4"/> <span>Tambah Siswa</span>
                                        </button>
                                    </td>
                                ))}
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            {renderUsageSummary()}
        </div>
    );
};

export default ClassPiketSchedule;
