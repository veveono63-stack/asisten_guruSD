import React, { useState, useEffect, useMemo } from 'react';
import { SchoolIdentity, Teacher, ClassScheduleData, Subject, ProsemRow, ProsemBulanCheckboxes } from '../types';
import { getSchoolIdentity, getTeacherProfile, getClassSchedule, getSubjects, getProsem, getCalendarEvents } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { ArrowDownTrayIcon, PrinterIcon, SparklesIcon } from './Icons';

declare const jspdf: any;

interface JurnalPembelajaranProps {
    selectedClass: string;
    selectedYear: string;
    userId?: string;
}

interface DailyJournalEntry {
    no: number | string;
    jamKe: string;
    mapel: string;
    tujuanPembelajaran: string;
    materi: string;
    keterangan: string;
}

interface DayJournalData {
    date: Date;
    dayName: string;
    formattedDate: string;
    entries: DailyJournalEntry[];
    isHoliday: boolean; 
    holidayDesc?: string;
    isEvent?: boolean; 
}

const JurnalPembelajaran: React.FC<JurnalPembelajaranProps> = ({ selectedClass, selectedYear, userId }) => {
    const [selectedSemester, setSelectedSemester] = useState<'Ganjil' | 'Genap'>('Ganjil');
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [enabledSubjects, setEnabledSubjects] = useState<Set<string>>(new Set());
    
    const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity | null>(null);
    const [teacher, setTeacher] = useState<Teacher | null>(null);
    const [schedule, setSchedule] = useState<ClassScheduleData | null>(null);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [prosemCache, setProsemCache] = useState<Map<string, ProsemRow[]>>(new Map());
    const [calendarEvents, setCalendarEvents] = useState<any[]>([]);

    const [isLoading, setIsLoading] = useState(true);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [isPdfMenuOpen, setIsPdfMenuOpen] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);

    // Auto-select semester based on date (LOCKED logic)
    useEffect(() => {
        const date = new Date(selectedDate);
        const month = date.getMonth(); // 0-11
        // Ganjil: Juli(6) - Desember(11)
        // Genap: Januari(0) - Juni(5)
        const semester = (month >= 6) ? 'Ganjil' : 'Genap';
        setSelectedSemester(semester);
    }, [selectedDate]);

    // Initial Data Fetch
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [identity, teacherData, scheduleData, subjectsData, events] = await Promise.all([
                    getSchoolIdentity(userId),
                    getTeacherProfile(selectedYear, selectedClass, userId),
                    getClassSchedule(selectedYear, selectedClass, userId),
                    getSubjects(selectedYear, selectedClass, userId),
                    getCalendarEvents(selectedYear, userId)
                ]);

                setSchoolIdentity(identity);
                setTeacher(teacherData);
                setSchedule(scheduleData);
                setSubjects(subjectsData);
                setCalendarEvents(events);
                
                // Initialize all subjects as enabled for automation (Default Checked All)
                setEnabledSubjects(new Set(subjectsData.map(s => s.name)));

                // Fetch Prosem for ALL subjects
                const prosemPromises = subjectsData.map(async (subj) => {
                    const subjectIdForApi = subj.name.toLowerCase().startsWith('seni ') 
                        ? subj.name.toLowerCase().replace(/\s+/g, '-')
                        : subj.code.toLowerCase();
                    
                    const data = await getProsem(selectedYear, selectedClass, subjectIdForApi, selectedSemester, userId);
                    return { name: subj.name, rows: data.rows };
                });

                const prosemResults = await Promise.all(prosemPromises);
                const newCache = new Map<string, ProsemRow[]>();
                prosemResults.forEach(res => {
                    newCache.set(res.name, res.rows);
                });
                setProsemCache(newCache);

            } catch (error: any) {
                setNotification({ message: 'Gagal memuat data jurnal: ' + error.message, type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [selectedClass, selectedYear, selectedSemester, userId]);

    // --- Helper Functions ---

    const getDayName = (date: Date): string => {
        const days = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
        return days[date.getDay()];
    };

    const formatDateIndo = (dateStr: string): string => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    };

    const formatIsoToProsemDate = (isoDate: string): string => {
        const [year, month, day] = isoDate.split('-');
        return `${day}-${month}-${year}`;
    };

    const getLocalDateString = (date: Date): string => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const getSemesterInfo = (date: Date) => {
        const month = date.getMonth(); 
        let semesterStartMonth = 6; 
        if (selectedSemester === 'Genap') {
            semesterStartMonth = 0; 
        }

        let monthIndex = month - semesterStartMonth;
        if (monthIndex < 0) monthIndex += 12;

        const weekIndex = Math.floor((date.getDate() - 1) / 7) + 1;
        
        return {
            monthIdx: monthIndex + 1, 
            weekIdx: Math.min(weekIndex, 5) 
        };
    };

    const getJournalDataForDate = (dateStr: string): DayJournalData => {
        const date = new Date(dateStr);
        const dayName = getDayName(date);
        const formattedDate = formatDateIndo(dateStr);
        const prosemDateStr = formatIsoToProsemDate(dateStr);

        if (dayName === 'minggu') {
            return { date, dayName, formattedDate, entries: [], isHoliday: true, holidayDesc: 'Libur Hari Minggu' };
        }

        const calendarEvent = calendarEvents.find(e => e.date === dateStr);
        if (calendarEvent) {
            const isRedDate = calendarEvent.type === 'holiday';
            return { 
                date, 
                dayName, 
                formattedDate, 
                entries: [{
                    no: '-',
                    jamKe: '-',
                    mapel: '-',
                    tujuanPembelajaran: '-',
                    materi: '-',
                    keterangan: calendarEvent.description 
                }], 
                isHoliday: isRedDate, 
                holidayDesc: calendarEvent.description,
                isEvent: true
            };
        }

        if (!schedule) return { date, dayName, formattedDate, entries: [], isHoliday: false };

        const { monthIdx, weekIdx } = getSemesterInfo(date);
        const prosemKey = `b${monthIdx}_m${weekIdx}` as keyof ProsemBulanCheckboxes;

        const rawSlots = schedule.timeSlots.map(slot => ({
            lessonNumber: slot.lessonNumber,
            timeRange: slot.timeRange,
            subject: slot.subjects[dayName as keyof typeof slot.subjects]
        })).filter(s => s.subject && s.subject !== '' && s.subject !== 'Istirahat');

        const groupedEntries: DailyJournalEntry[] = [];
        let currentSubject = '';
        let startSlot = '';
        let endSlot = '';
        
        const findContent = (subjName: string) => {
            const normalizedName = subjName.trim().toLowerCase();

            // Special Case: Upacara (No "Diisi Guru Mapel")
            if (normalizedName === 'upacara' || normalizedName === 'upacara bendera') {
                return { tp: '-', materi: '-', keterangan: '' };
            }

            // Check if automation is disabled for this subject
            if (!enabledSubjects.has(subjName)) {
                return { tp: '-', materi: '-', keterangan: 'Diisi Guru Mapel' };
            }

            const rows = prosemCache.get(subjName);
            if (!rows) return { tp: '', materi: '', keterangan: '' };
            
            const dateMatchRow = rows.find(r => r.keterangan && r.keterangan.includes(prosemDateStr));
            if (dateMatchRow) {
                return { tp: dateMatchRow.atp, materi: dateMatchRow.lingkupMateri, keterangan: '' };
            }

            const activeRow = rows.find(r => r.pekan[prosemKey] === true);
            if (activeRow) {
                return { tp: activeRow.atp, materi: activeRow.lingkupMateri, keterangan: '' };
            }
            return { tp: '', materi: '', keterangan: '' };
        };

        if (rawSlots.length === 0) {
             return { date, dayName, formattedDate, entries: [], isHoliday: true, holidayDesc: 'Tidak ada jadwal pelajaran' };
        } else {
            rawSlots.forEach((slot, index) => {
                if (slot.subject !== currentSubject) {
                    if (currentSubject) {
                        const { tp, materi, keterangan } = findContent(currentSubject);
                        groupedEntries.push({
                            no: groupedEntries.length + 1,
                            jamKe: startSlot === endSlot ? startSlot : `${startSlot}-${endSlot}`,
                            mapel: currentSubject,
                            tujuanPembelajaran: tp,
                            materi: materi,
                            keterangan: keterangan
                        });
                    }
                    currentSubject = slot.subject;
                    startSlot = slot.lessonNumber;
                    endSlot = slot.lessonNumber;
                } else {
                    endSlot = slot.lessonNumber;
                }

                if (index === rawSlots.length - 1) {
                    const { tp, materi, keterangan } = findContent(currentSubject);
                    groupedEntries.push({
                        no: groupedEntries.length + 1,
                        jamKe: startSlot === endSlot ? startSlot : `${startSlot}-${endSlot}`,
                        mapel: currentSubject,
                        tujuanPembelajaran: tp,
                        materi: materi,
                        keterangan: keterangan
                    });
                }
            });
        }

        return { date, dayName, formattedDate, entries: groupedEntries, isHoliday: false };
    };

    const currentJournalData = useMemo(() => getJournalDataForDate(selectedDate), [selectedDate, schedule, prosemCache, calendarEvents, enabledSubjects]);

    const semesterHolidayDates = useMemo(() => {
        const dates = new Set<string>();
        if (calendarEvents) {
            calendarEvents.forEach(e => {
                if (e.description && e.description.toLowerCase().includes('libur semester')) {
                    dates.add(e.date);
                }
            });
        }
        return dates;
    }, [calendarEvents]);

    const toggleSubject = (name: string) => {
        setEnabledSubjects(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const generatePDF = async (mode: 'daily' | 'weekly' | 'monthly' | 'semester') => {
        if (!schoolIdentity || !teacher) {
            setNotification({ message: 'Data identitas sekolah/guru belum lengkap.', type: 'error' });
            return;
        }

        setIsGeneratingPDF(true);
        setIsPdfMenuOpen(false);
        setNotification({ message: 'Mempersiapkan PDF...', type: 'info' });
        await new Promise(r => setTimeout(r, 100));

        try {
            const { jsPDF } = jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [215, 330] }); 
            
            const margin = { top: 10, left: 20, right: 10, bottom: 10 };
            const pageWidth = 215;
            const pageHeight = 330;
            let y = margin.top;

            const datesToPrint: string[] = [];
            const startDateObj = new Date(selectedDate);
            
            if (mode === 'daily') {
                datesToPrint.push(selectedDate);
            } else if (mode === 'weekly') {
                const day = startDateObj.getDay();
                const diff = startDateObj.getDate() - day + (day === 0 ? -6 : 1); 
                const monday = new Date(startDateObj);
                monday.setDate(diff);
                for(let i=0; i<6; i++) { 
                    const d = new Date(monday);
                    d.setDate(monday.getDate() + i);
                    datesToPrint.push(getLocalDateString(d));
                }
            } else if (mode === 'monthly') {
                const year = startDateObj.getFullYear();
                const month = startDateObj.getMonth();
                const daysInMonth = new Date(year, month + 1, 0).getDate();
                for(let i=1; i<=daysInMonth; i++) {
                    const d = new Date(year, month, i);
                    datesToPrint.push(getLocalDateString(d));
                }
            } else if (mode === 'semester') {
                const [startYearNum] = selectedYear.split('/').map(Number);
                let startM = 6, endM = 11, year = startYearNum;
                if (selectedSemester === 'Genap') {
                    startM = 0; endM = 5; year = startYearNum + 1;
                }
                const startSem = new Date(year, startM, 1);
                const endSem = new Date(year, endM + 1, 0); 
                
                for (let d = new Date(startSem); d <= endSem; d.setDate(d.getDate() + 1)) {
                    datesToPrint.push(getLocalDateString(d));
                }
            }

            for (const dateStr of datesToPrint) {
                if (semesterHolidayDates.has(dateStr)) {
                    continue;
                }

                const data = getJournalDataForDate(dateStr);
                
                if (data.dayName === 'minggu') continue;

                if (data.isHoliday && data.holidayDesc && data.holidayDesc.toLowerCase().includes('libur semester')) {
                    continue;
                }

                const rowsCount = data.entries.length > 0 ? data.entries.length : 1;
                const estimatedRowHeight = 10; 
                const estimatedBlockHeight = 10 + 8 + (rowsCount * estimatedRowHeight) + 25 + 5;

                if (y + estimatedBlockHeight > pageHeight - margin.bottom) {
                    pdf.addPage();
                    y = margin.top;
                }

                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(10);
                pdf.text("JURNAL HARIAN PELAKSANAAN PEMBELAJARAN", pageWidth / 2, y, { align: 'center' });
                y += 4;
                
                pdf.setFontSize(9);
                pdf.setFont('helvetica', 'normal');
                pdf.text(`Hari/Tanggal: ${data.formattedDate}`, margin.left, y);
                
                if (data.isHoliday) {
                    pdf.setTextColor(220, 38, 38); 
                    if (!data.entries.length || (data.entries.length === 1 && data.entries[0].mapel === '-')) {
                         pdf.text(`( ${data.holidayDesc || 'Libur'} )`, margin.left + 80, y);
                    }
                    pdf.setTextColor(0, 0, 0);
                }
                y += 2;

                const head = [['No', 'Jam', 'Mata Pelajaran', 'Tujuan Pembelajaran', 'Materi', 'Ket']];
                let body = [];
                
                if (data.entries.length > 0) {
                    body = data.entries.map(e => [
                        e.no,
                        e.jamKe,
                        e.mapel,
                        e.tujuanPembelajaran || '-',
                        e.materi || '-',
                        e.keterangan
                    ]);
                } else if (data.isHoliday) {
                     body = [['-', '-', '-', '-', '-', data.holidayDesc || 'Libur']];
                } else {
                     body = [['-', '-', '-', '-', '-', '-']];
                }

                (pdf as any).autoTable({
                    head: head,
                    body: body,
                    startY: y,
                    theme: 'grid',
                    headStyles: {
                        fillColor: [230, 230, 230],
                        textColor: 0,
                        fontStyle: 'bold',
                        halign: 'center',
                        lineWidth: 0.1,
                        lineColor: 0
                    },
                    styles: {
                        fontSize: 8,
                        lineColor: 0,
                        lineWidth: 0.1,
                        cellPadding: 1,
                        valign: 'top',
                        textColor: 0
                    },
                    columnStyles: {
                        0: { cellWidth: 8, halign: 'center' },
                        1: { cellWidth: 12, halign: 'center' },
                        2: { cellWidth: 35 },
                        3: { cellWidth: 50 },
                        4: { cellWidth: 45 },
                        5: { cellWidth: 35 } 
                    },
                    margin: { left: margin.left, right: margin.right },
                });

                y = (pdf as any).lastAutoTable.finalY + 3;

                if ((!data.isHoliday && data.entries.length > 0) || data.isEvent) {
                    const sigY = y;
                    const teacherX = pageWidth - margin.right - 50;
                    const principalX = margin.left + 10;

                    pdf.setFontSize(8);
                    pdf.text('Mengetahui,', principalX, sigY);
                    pdf.text('Kepala Sekolah', principalX, sigY + 3);
                    
                    pdf.text(`Guru Kelas ${selectedClass.replace('Kelas ', '')}`, teacherX, sigY + 3);

                    pdf.setFont('helvetica', 'bold');
                    pdf.text(schoolIdentity.principalName, principalX, sigY + 15);
                    pdf.text(teacher.fullName, teacherX, sigY + 15);

                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${schoolIdentity.principalNip}`, principalX, sigY + 18);
                    pdf.text(`NIP. ${teacher.nip}`, teacherX, sigY + 18);
                    
                    y = sigY + 22; 
                } else {
                    y += 5;
                }
                
                pdf.setDrawColor(150, 150, 150);
                pdf.setLineWidth(0.5);
                pdf.line(margin.left, y, pageWidth - margin.right, y);
                y += 8; 
            }

            pdf.save(`Jurnal-Pembelajaran-${selectedClass.replace(/\s+/g, '_')}-${mode}.pdf`);
            setNotification({ message: 'PDF Berhasil dibuat.', type: 'success' });

        } catch (e) {
            console.error(e);
            setNotification({ message: 'Gagal membuat PDF.', type: 'error' });
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg min-h-[600px]">
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}

            {/* Header Controls */}
            <div className="flex flex-col mb-8 gap-4 border-b pb-6">
                <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                    <div className="flex items-center gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal & Semester</label>
                            <div className="flex items-center gap-2">
                                <input 
                                    type="date" 
                                    value={selectedDate} 
                                    onChange={(e) => setSelectedDate(e.target.value)} 
                                    className="block w-40 pl-3 pr-2 py-2 border border-gray-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                />
                                <div className="px-4 py-2 bg-gray-100 border rounded-md text-sm font-bold text-indigo-700 select-none">
                                    Semester {selectedSemester}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="relative">
                        <button 
                            onClick={() => setIsPdfMenuOpen(!isPdfMenuOpen)} 
                            disabled={isGeneratingPDF}
                            className="inline-flex justify-center w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75 disabled:bg-indigo-400 shadow-sm"
                        >
                            {isGeneratingPDF ? (
                                <span className="flex items-center"><svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Memproses...</span>
                            ) : (
                                <span className="flex items-center"><PrinterIcon className="w-5 h-5 mr-2" /> Cetak PDF <ArrowDownTrayIcon className="w-4 h-4 ml-2"/></span>
                            )}
                        </button>
                        {isPdfMenuOpen && (
                            <div className="absolute right-0 mt-2 w-56 origin-top-right bg-white divide-y divide-gray-100 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-10 border border-gray-100">
                                <div className="px-1 py-1">
                                    <button onClick={() => generatePDF('daily')} className="group flex rounded-md items-center w-full px-2 py-2 text-sm text-gray-900 hover:bg-indigo-500 hover:text-white transition-colors">Cetak Harian (1 Hari)</button>
                                    <button onClick={() => generatePDF('weekly')} className="group flex rounded-md items-center w-full px-2 py-2 text-sm text-gray-900 hover:bg-indigo-500 hover:text-white transition-colors">Cetak Mingguan</button>
                                    <button onClick={() => generatePDF('monthly')} className="group flex rounded-md items-center w-full px-2 py-2 text-sm text-gray-900 hover:bg-indigo-500 hover:text-white transition-colors">Cetak Bulanan</button>
                                    <button onClick={() => generatePDF('semester')} className="group flex rounded-md items-center w-full px-2 py-2 text-sm text-gray-900 hover:bg-indigo-500 hover:text-white border-t border-gray-100 transition-colors">Cetak Full Semester</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 shadow-sm transition-all">
                    <h4 className="text-xs font-bold text-indigo-800 uppercase mb-3 flex items-center gap-2">
                        <SparklesIcon className="w-3 h-3"/> Otomatisasi Isi (Cek Mapel yang Diizinkan):
                    </h4>
                    <div className="flex flex-wrap gap-3">
                        {subjects.map(subj => (
                            <label key={subj.id} className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-full border border-indigo-200 cursor-pointer hover:bg-indigo-100 transition-colors shadow-sm">
                                <input 
                                    type="checkbox" 
                                    checked={enabledSubjects.has(subj.name)} 
                                    onChange={() => toggleSubject(subj.name)}
                                    className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                />
                                <span className="text-xs font-semibold text-gray-700">{subj.name}</span>
                            </label>
                        ))}
                    </div>
                </div>
            </div>

            {/* Journal Preview */}
            <div className="bg-gray-50 border border-gray-300 p-8 rounded-lg shadow-sm print-preview">
                <div className="text-center mb-6">
                    <h2 className="text-xl font-bold text-gray-900 uppercase tracking-wide underline decoration-2 underline-offset-4">JURNAL HARIAN PELAKSANAAN PEMBELAJARAN</h2>
                </div>

                <div className="mb-4 text-gray-800 font-medium text-lg">
                    Hari/Tanggal: <span className="font-normal border-b border-gray-400 px-2">{currentJournalData.formattedDate}</span>
                </div>

                {currentJournalData.isHoliday && !currentJournalData.isEvent && !currentJournalData.entries.length ? (
                    <div className="p-8 text-center bg-red-50 border border-red-200 rounded-lg text-red-700 font-semibold text-lg">
                        {currentJournalData.holidayDesc}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse border border-black text-sm shadow-sm">
                            <thead className="bg-gray-200 text-center font-bold">
                                <tr>
                                    <th className="border border-black p-3 w-10">No</th>
                                    <th className="border border-black p-3 w-20">Jam Ke-</th>
                                    <th className="border border-black p-3 w-1/5">Mata Pelajaran</th>
                                    <th className="border border-black p-3 w-1/4">Tujuan Pembelajaran</th>
                                    <th className="border border-black p-3 w-1/4">Materi</th>
                                    <th className="border border-black p-3">Keterangan</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentJournalData.entries.length > 0 ? (
                                    currentJournalData.entries.map((entry, index) => (
                                        <tr key={index} className="bg-white">
                                            <td className="border border-black p-2 text-center align-top">{entry.no}</td>
                                            <td className="border border-black p-2 text-center align-top">{entry.jamKe}</td>
                                            <td className="border border-black p-2 align-top font-medium">{entry.mapel}</td>
                                            <td className="border border-black p-2 align-top whitespace-pre-wrap">
                                                {entry.tujuanPembelajaran || <span className="text-gray-400 italic">Belum diset di Prosem</span>}
                                            </td>
                                            <td className="border border-black p-2 align-top whitespace-pre-wrap">
                                                {entry.materi || <span className="text-gray-400 italic">Belum diset di Prosem</span>}
                                            </td>
                                            <td className="border border-black p-2 align-top font-semibold text-blue-700">
                                                {entry.keterangan}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={6} className="border border-black p-8 text-center text-gray-500 italic">
                                            Tidak ada jadwal pelajaran pada hari ini. Silakan periksa Jadwal Pelajaran.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Signatures Preview */}
                {(!currentJournalData.isHoliday || currentJournalData.entries.length > 0 || currentJournalData.isEvent) && (
                    <div className="flex justify-between mt-16 px-10">
                        <div className="text-center">
                            <p>Mengetahui,</p>
                            <p>Kepala Sekolah</p>
                            <div className="h-20"></div>
                            <p className="font-bold underline">{schoolIdentity?.principalName}</p>
                            <p>NIP. {schoolIdentity?.principalNip}</p>
                        </div>
                        <div className="text-center">
                            <p className="mb-6">&nbsp;</p>
                            <p>Guru Kelas {selectedClass.replace('Kelas ', '')}</p>
                            <div className="h-20"></div>
                            <p className="font-bold underline">{teacher?.fullName}</p>
                            <p>NIP. {teacher?.nip}</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default JurnalPembelajaran;
