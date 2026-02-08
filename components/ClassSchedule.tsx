
import React, { useState, useEffect, useMemo } from 'react';
import { ClassScheduleData, ScheduleTimeSlot, Subject, Teacher, SchoolIdentity } from '../types';
import { defaultSchedule, getClassSchedule, updateClassSchedule, getSubjects, getTeacherProfile, getSchoolIdentity, pullClassScheduleToTeacher } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { ArrowDownTrayIcon, PencilIcon, TrashIcon, SparklesIcon, ArrowPathIcon } from './Icons';

declare const jspdf: any;

interface ClassScheduleProps {
    selectedClass: string;
    selectedYear: string;
    userId?: string;
}

const subjectSortOrder = [
    'pendidikan agama islam dan budi pekerti',
    'pendidikan pancasila',
    'bahasa indonesia',
    'matematika',
    'ilmu pengetahuan alam dan sosial',
    'pendidikan jasmani, olahraga, dan kesehatan',
    'seni', // Special keyword for grouping
    'bahasa inggris',
    'bahasa jawa',
    'pendidikan lingkungan hidup',
    'koding dan kecerdasan artifisial',
];

const getSortIndex = (subjectName: string): number => {
    const lowerName = subjectName.toLowerCase();
    
    if (lowerName.startsWith('seni')) {
        return subjectSortOrder.indexOf('seni');
    }
    
    // This will handle both "Bahasa Inggris" and "Bahasa Inggris (Opsional)"
    if (lowerName.startsWith('bahasa inggris')) {
        return subjectSortOrder.indexOf('bahasa inggris');
    }
    
    const index = subjectSortOrder.indexOf(lowerName);
    return index === -1 ? 99 : index; // Put unknown subjects at the end
};

const sortSubjects = (subjects: Subject[]): Subject[] => {
    return [...subjects].sort((a, b) => {
        const indexA = getSortIndex(a.name);
        const indexB = getSortIndex(b.name);

        if (indexA !== indexB) {
            return indexA - indexB;
        }

        // If in the same group (e.g., both 'Seni'), sort alphabetically
        return a.name.localeCompare(b.name);
    });
};

// Helper component to display remaining JP
const RemainingHoursTracker: React.FC<{
    subjects: Subject[];
    subjectHoursMap: Map<string, number>;
    subjectUsage: Map<string, number>;
    subjectShortNames: { [key: string]: string };
}> = ({ subjects, subjectHoursMap, subjectUsage, subjectShortNames }) => {

    return (
        <div className="mt-6 p-4 border rounded-lg bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-700 mb-3">Sisa Jam Pelajaran (JP) per Minggu</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 text-sm">
                {subjects.map(subject => {
                    const total = subjectHoursMap.get(subject.name) || 0;
                    const used = subjectUsage.get(subject.name) || 0;
                    const remaining = total - used;
                    const isDepleted = remaining <= 0;
                    return (
                        <div key={subject.id} className={`p-2 rounded transition-colors duration-300 ${isDepleted ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                            <span className="font-medium">{subjectShortNames[subject.name] || subject.name}:</span>
                            <span className="font-bold float-right">{remaining} JP</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};


const ClassSchedule: React.FC<ClassScheduleProps> = ({ selectedClass, selectedYear, userId }) => {
    const [schedule, setSchedule] = useState<ClassScheduleData | null>(null);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [teacher, setTeacher] = useState<Teacher | null>(null);
    const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isPulling, setIsPulling] = useState(false);
    const [isPullModalOpen, setIsPullModalOpen] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);
    const [signatureDate, setSignatureDate] = useState(new Date().toISOString().split('T')[0]);
    const [isPdfDropdownOpen, setIsPdfDropdownOpen] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

    const days: (keyof ScheduleTimeSlot['subjects'])[] = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            setNotification(null);
            try {
                const [scheduleData, subjectsData, teacherData, identityData] = await Promise.all([
                    getClassSchedule(selectedYear, selectedClass, userId),
                    getSubjects(selectedYear, selectedClass, userId),
                    getTeacherProfile(selectedYear, selectedClass, userId),
                    getSchoolIdentity(userId),
                ]);
                setSchedule(scheduleData);
                setSubjects(sortSubjects(subjectsData));
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

    const subjectShortNames: { [key: string]: string } = useMemo(() => ({
        'Pendidikan Agama Islam Dan Budi Pekerti': 'PAIBP',
        'Pendidikan Pancasila': 'P. Pancasila',
        'Bahasa Indonesia': 'B. Indonesia',
        'Matematika': 'Matematika',
        'Ilmu Pengetahuan Alam Dan Sosial': 'IPAS',
        'Pendidikan Jasmani, Olahraga, Dan Kesehatan': 'PJOK',
        'Seni Rupa': 'Seni Rupa',
        'Bahasa Inggris': 'B. Inggris',
        'Bahasa Inggris (Opsional)': 'B. Inggris',
        'Bahasa Jawa': 'B. Jawa',
        'Pendidikan Lingkungan Hidup': 'PLH',
        'Koding Dan Kecerdasan Artificial': 'Koding & KA',
    }), []);
    
    // Map from subject name to its total weekly hours
    const subjectHoursMap = useMemo(() => {
        return new Map(subjects.map(s => [s.name, s.hours]));
    }, [subjects]);

    // Calculate current usage of each subject in the schedule
    const subjectUsage = useMemo(() => {
        if (!schedule) return new Map<string, number>();
        const usage = new Map<string, number>();
        const validSubjectNames = new Set(subjects.map(s => s.name));

        schedule.timeSlots.forEach(slot => {
            days.forEach(day => {
                const subjectName = slot.subjects[day];
                if (subjectName && validSubjectNames.has(subjectName)) {
                    usage.set(subjectName, (usage.get(subjectName) || 0) + 1);
                }
            });
        });
        return usage;
    }, [schedule, subjects]);


    const handleSlotChange = (slotId: string, field: keyof ScheduleTimeSlot, value: any) => {
        if (!schedule) return;
        const newTimeSlots = schedule.timeSlots.map(slot => 
            slot.id === slotId ? { ...slot, [field]: value } : slot
        );
        setSchedule({ ...schedule, timeSlots: newTimeSlots });
    };

    const handleSubjectChange = (slotId: string, day: keyof ScheduleTimeSlot['subjects'], value: string) => {
        if (!schedule) return;
        const newTimeSlots = schedule.timeSlots.map(slot => {
            if (slot.id === slotId) {
                const newSubjects = { ...slot.subjects, [day]: value };
                return { ...slot, subjects: newSubjects };
            }
            return slot;
        });
        setSchedule({ ...schedule, timeSlots: newTimeSlots });
    };
    
    const handleFillDefault = () => {
        if (window.confirm('Tindakan ini akan menimpa jadwal saat ini dengan jadwal default. Lanjutkan?')) {
            setSchedule(defaultSchedule);
            setNotification({ message: 'Jadwal default telah dimuat.', type: 'info' });
        }
    };

    const handlePullFromMaster = () => {
        if (!userId) return;
        setIsPullModalOpen(true);
    };

    const executePullFromMaster = async () => {
        if (!userId) return;
        setIsPulling(true);
        setNotification(null);
        try {
            const masterSchedule = await pullClassScheduleToTeacher(selectedYear, selectedClass, userId);
            setSchedule(masterSchedule);
            setNotification({ message: 'Jadwal berhasil disinkronkan dengan data Induk Admin!', type: 'success' });
            setIsPullModalOpen(false);
        } catch (error: any) {
            setNotification({ message: 'Gagal menarik data: ' + error.message, type: 'error' });
        } finally {
            setIsPulling(false);
        }
    };

    const handleAddRow = () => {
        if (!schedule) return;
        const newSlot: ScheduleTimeSlot = {
            id: `new-${Date.now()}`,
            lessonNumber: String(schedule.timeSlots.length), // Auto-increment lesson number roughly
            timeRange: '',
            subjects: { senin: '', selasa: '', rabu: '', kamis: '', jumat: '', sabtu: '' }
        };
        const breakIndex = schedule.timeSlots.findIndex(s => s.id === 'break');
        const newTimeSlots = [...schedule.timeSlots];
        if (breakIndex !== -1) {
            newTimeSlots.splice(breakIndex, 0, newSlot);
        } else {
            newTimeSlots.push(newSlot);
        }
        setSchedule({ ...schedule, timeSlots: newTimeSlots });
    };


    const handleRemoveRow = (slotId: string) => {
        if (!schedule) return;
        if (['break', '1'].includes(slotId)) {
             setNotification({ message: 'Baris default tidak dapat dihapus.', type: 'info' });
            return;
        }
        const newTimeSlots = schedule.timeSlots.filter(slot => slot.id !== slotId);
        setSchedule({ ...schedule, timeSlots: newTimeSlots });
    };

    const handleSave = async () => {
        if (!schedule) return;
        setIsSaving(true);
        setNotification(null);
        try {
            await updateClassSchedule(selectedYear, selectedClass, schedule, userId);
            setNotification({ message: 'Jadwal pelajaran berhasil disimpan.', type: 'success' });
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

            // Header
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            pdf.text(`JADWAL PELAJARAN ${selectedClass.toUpperCase()}`, pageWidth / 2, y, { align: 'center' });
            y += 6;
            pdf.text(schoolIdentity.schoolName.toUpperCase(), pageWidth / 2, y, { align: 'center' });
            y += 6;
            pdf.setFontSize(11);
            pdf.text(`TAHUN AJARAN ${selectedYear}`, pageWidth / 2, y, { align: 'center' });
            y += 10;

            // Table
            const head = [['JAM KE-', 'WAKTU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUM\'AT', 'SABTU']];
            const body = schedule.timeSlots.map(slot => {
                const s = slot.subjects;
                if (slot.id === 'break') {
                     return [
                        { content: slot.lessonNumber },
                        { content: slot.timeRange },
                        { content: 'ISTIRAHAT', colSpan: 6, styles: { halign: 'center', fontStyle: 'bold' } },
                    ];
                }
                return [
                    { content: slot.lessonNumber },
                    { content: slot.timeRange },
                    subjectShortNames[s.senin] || s.senin,
                    subjectShortNames[s.selasa] || s.selasa,
                    subjectShortNames[s.rabu] || s.rabu,
                    subjectShortNames[s.kamis] || s.kamis,
                    subjectShortNames[s.jumat] || s.jumat,
                    subjectShortNames[s.sabtu] || s.sabtu,
                ];
            });
            
            (pdf as any).autoTable({
                head, body, startY: y, theme: 'grid',
                headStyles: {
                    fillColor: [224, 231, 255],
                    textColor: [0, 0, 0],
                    fontStyle: 'bold',
                    halign: 'center',
                    valign: 'middle',
                    lineColor: [0, 0, 0],
                    lineWidth: 0.1
                },
                styles: {
                    fontSize: 9,
                    cellPadding: 2,
                    halign: 'center',
                    valign: 'middle',
                    textColor: [0, 0, 0],
                    lineColor: [0, 0, 0],
                    lineWidth: 0.1
                },
                columnStyles: {
                    0: { cellWidth: 15 },
                    1: { cellWidth: 25 },
                }
            });
            
            y = (pdf as any).lastAutoTable.finalY + 15;

            // Signatures
            if (signatureOption !== 'none') {
                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'normal');
                const formattedDate = new Date(signatureDate + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

                if (signatureOption === 'both') {
                    const principalX = 82.5; // Centered in the left half
                    const signatureXTeacher = 247.5; // Centered in the right half

                    pdf.text('Mengetahui,', principalX, y, { align: 'center' });
                    pdf.text('Kepala Sekolah', principalX, y + 5, { align: 'center' });
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(schoolIdentity.principalName, principalX, y + 25, { align: 'center' });
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${schoolIdentity.principalNip}`, principalX, y + 30, { align: 'center' });

                    pdf.text(`${schoolIdentity.city || '...................'}, ${formattedDate}`, signatureXTeacher, y, { align: 'center' });
                    pdf.text(`Wali ${selectedClass}`, signatureXTeacher, y + 5, { align: 'center' });
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(teacher.fullName, signatureXTeacher, y + 25, { align: 'center' });
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${teacher.nip}`, signatureXTeacher, y + 30, { align: 'center' });

                } else if (signatureOption === 'teacher') {
                    const signatureXTeacher = 247.5; // Centered on the right half
                    pdf.text(`${schoolIdentity.city || '...................'}, ${formattedDate}`, signatureXTeacher, y, { align: 'center' });
                    pdf.text(`Wali ${selectedClass}`, signatureXTeacher, y + 5, { align: 'center' });
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(teacher.fullName, signatureXTeacher, y + 25, { align: 'center' });
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${teacher.nip}`, signatureXTeacher, y + 30, { align: 'center' });
                }
            }


            pdf.save(`Jadwal-Pelajaran-${selectedClass.replace(' ', '_')}-${selectedYear.replace('/', '-')}.pdf`);
            setNotification({ message: 'PDF berhasil dibuat.', type: 'success' });

        } catch (error) {
            console.error(error);
            setNotification({ message: 'Gagal membuat PDF.', type: 'error' });
        } finally {
            setIsGeneratingPDF(false);
        }
    };


    if (isLoading) return <div className="text-center p-8">Memuat jadwal pelajaran...</div>;
    if (!schedule) return <div className="text-center p-8 text-red-500">Gagal memuat data.</div>;

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg">
             <style>{`.input-style { width: 100%; padding: 0.5rem; border: 1px solid #D1D5DB; border-radius: 0.375rem; }`}</style>
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}

            <div className="flex justify-between items-center mb-4">
                <div>
                     {isEditing && (
                        <div className="flex space-x-2">
                             <button onClick={handleFillDefault} className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 font-semibold shadow flex items-center space-x-2">
                                <SparklesIcon className="w-4 h-4" /> <span>Isi Jadwal Default</span>
                            </button>
                            <button onClick={handleAddRow} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold shadow">
                                + Tambah Baris Waktu
                            </button>
                        </div>
                    )}
                </div>
                <div className="flex items-center space-x-2">
                    {isEditing ? (
                        <>
                            <button onClick={() => setIsEditing(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold">Batal</button>
                            <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold disabled:bg-indigo-400">{isSaving ? 'Menyimpan...' : 'Simpan'}</button>
                        </>
                    ) : (
                        <>
                            {userId && (
                                <button 
                                    onClick={handlePullFromMaster}
                                    disabled={isPulling}
                                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold shadow flex items-center space-x-2 disabled:bg-purple-400"
                                >
                                    {isPulling ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <SparklesIcon className="w-5 h-5" />}
                                    <span>Tarik dari Induk</span>
                                </button>
                            )}
                            <label htmlFor="signatureDate" className="text-sm font-medium text-gray-700 shrink-0">Tanggal Cetak:</label>
                            <input type="date" id="signatureDate" value={signatureDate} onChange={(e) => setSignatureDate(e.target.value)} className="block w-auto px-2 py-1 border border-gray-300 rounded-md shadow-sm sm:text-sm"/>
                            <div className="relative">
                                <button onClick={() => setIsPdfDropdownOpen(!isPdfDropdownOpen)} disabled={isGeneratingPDF} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-semibold shadow flex items-center space-x-2 disabled:bg-gray-400">
                                    <ArrowDownTrayIcon /> <span>{isGeneratingPDF ? 'Memproses...' : 'Download PDF'}</span>
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
                            <button onClick={() => setIsEditing(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold shadow flex items-center space-x-2"><PencilIcon /> <span>Edit</span></button>
                        </>
                    )}
                </div>
            </div>

            <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-full text-sm text-center">
                    <thead className="bg-indigo-100 uppercase">
                        <tr>
                            <th className="p-2 border">JAM KE-</th>
                            <th className="p-2 border">WAKTU</th>
                            {days.map(day => <th key={day} className="p-2 border">{day === 'jumat' ? "JUM'AT" : day.toUpperCase()}</th>)}
                            {isEditing && <th className="p-2 border w-12">Aksi</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {schedule.timeSlots.map((slot) => {
                             if (!isEditing) {
                                // VIEW MODE
                                return (
                                     <tr key={slot.id} className="hover:bg-gray-50">
                                        {slot.id === 'break' ? (
                                            <>
                                                <td className="border p-2 font-medium">{slot.lessonNumber}</td>
                                                <td className="border p-2 font-mono">{slot.timeRange}</td>
                                                <td colSpan={6} className="border p-2 bg-gray-200 font-bold uppercase text-center">
                                                    {slot.subjects.senin}
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="border p-2 font-medium">{slot.lessonNumber}</td>
                                                <td className="border p-2 font-mono">{slot.timeRange}</td>
                                                {days.map(day => (
                                                    <td key={day} className="border p-2">
                                                        {subjectShortNames[slot.subjects[day]] || slot.subjects[day]}
                                                    </td>
                                                ))}
                                            </>
                                        )}
                                    </tr>
                                )
                            }
                            // EDIT MODE
                            if (slot.id === 'break') {
                                return (
                                    <tr key={slot.id} className="bg-gray-200">
                                        <td className="border p-1"><input type="text" value={slot.lessonNumber} onChange={(e) => handleSlotChange(slot.id, 'lessonNumber', e.target.value)} className="input-style text-center bg-gray-100" /></td>
                                        <td className="border p-1"><input type="text" value={slot.timeRange} onChange={(e) => handleSlotChange(slot.id, 'timeRange', e.target.value)} className="input-style text-center bg-gray-100" /></td>
                                        <td colSpan={6} className="border p-2 font-bold uppercase text-center">ISTIRAHAT</td>
                                        <td className="border p-1">
                                            <button onClick={() => handleRemoveRow(slot.id)} disabled className="p-1 text-gray-400 cursor-not-allowed">
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            }
                            return (
                                <tr key={slot.id} className="hover:bg-gray-50">
                                    <td className="border p-1"><input type="text" value={slot.lessonNumber} onChange={(e) => handleSlotChange(slot.id, 'lessonNumber', e.target.value)} className="input-style text-center" disabled={slot.id === '1'} /></td>
                                    <td className="border p-1"><input type="text" value={slot.timeRange} onChange={(e) => handleSlotChange(slot.id, 'timeRange', e.target.value)} className="input-style text-center" /></td>
                                    {days.map(day => {
                                        if (slot.id === '1' && day === 'senin') {
                                            return <td key={day} className="border p-2 bg-gray-200 font-bold">Upacara</td>;
                                        }

                                        const currentSubjectName = slot.subjects[day];
                                        const availableOptions = subjects.filter(s => {
                                            const total = subjectHoursMap.get(s.name) || 0;
                                            const used = subjectUsage.get(s.name) || 0;
                                            return total > used;
                                        });

                                        const isCurrentSelectedInAvailable = availableOptions.some(s => s.name === currentSubjectName);
                                        if (currentSubjectName && !isCurrentSelectedInAvailable) {
                                            const currentSubjectObject = subjects.find(s => s.name === currentSubjectName);
                                            if (currentSubjectObject) {
                                                availableOptions.push(currentSubjectObject);
                                            }
                                        }

                                        return (
                                            <td key={day} className="border p-1">
                                                <select value={currentSubjectName} onChange={(e) => handleSubjectChange(slot.id, day, e.target.value)} className="input-style bg-white w-full">
                                                    <option value="">- Kosong -</option>
                                                    {availableOptions.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                                </select>
                                            </td>
                                        );
                                    })}
                                    <td className="border p-1">
                                        <button onClick={() => handleRemoveRow(slot.id)} disabled={slot.id === '1'} className="p-1 text-red-500 hover:text-red-700 disabled:text-gray-400 disabled:cursor-not-allowed">
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

             {isEditing && (
                <RemainingHoursTracker 
                    subjects={subjects}
                    subjectHoursMap={subjectHoursMap}
                    subjectUsage={subjectUsage}
                    subjectShortNames={subjectShortNames}
                />
            )}

            {/* Modal Konfirmasi Tarik Data Induk */}
            {isPullModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black bg-opacity-60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all animate-fade-in scale-100">
                        <div className="p-6">
                            <div className="flex items-center justify-center w-16 h-16 mx-auto bg-purple-100 rounded-full mb-4">
                                <SparklesIcon className="w-10 h-10 text-purple-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Tarik Jadwal Induk?</h3>
                            <p className="text-gray-600 text-center text-sm mb-6">
                                Anda akan menyalin data jadwal pelajaran dari Admin khusus untuk <span className="font-bold">{selectedClass}</span>. 
                                <br/><br/>
                                <span className="text-red-600 font-bold">Peringatan:</span> Jadwal yang Anda susun sendiri saat ini akan <span className="underline">ditimpa sepenuhnya</span>.
                            </p>
                            <div className="flex flex-col gap-2">
                                <button 
                                    onClick={executePullFromMaster}
                                    disabled={isPulling}
                                    className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors shadow-lg flex items-center justify-center gap-2"
                                >
                                    {isPulling ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : null}
                                    {isPulling ? 'SEDANG MENYALIN...' : 'YA, TARIK JADWAL SEKARANG'}
                                </button>
                                <button 
                                    onClick={() => setIsPullModalOpen(false)}
                                    disabled={isPulling}
                                    className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                                >
                                    BATALKAN
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClassSchedule;
