
import React, { useState, useEffect, useMemo } from 'react';
import { SchoolIdentity, Teacher, ClassScheduleData, Subject, ProsemRow, ProsemBulanCheckboxes } from '../types';
import { getSchoolIdentity, getTeacherProfile, getClassSchedule, getSubjects, getProsem, getCalendarEvents } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { ArrowDownTrayIcon, PrinterIcon, SparklesIcon, CalendarIcon, ChevronDownIcon, XCircleIcon } from './Icons';

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
    
    // States for custom date range printing
    const [startDateRange, setStartDateRange] = useState<string>(new Date().toISOString().split('T')[0]);
    const [endDateRange, setEndDateRange] = useState<string>(new Date().toISOString().split('T')[0]);
    
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

    // Auto-select semester based on date
    useEffect(() => {
        const date = new Date(selectedDate);
        const month = date.getMonth(); 
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
                
                setEnabledSubjects(new Set(subjectsData.map(s => s.name)));

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

        const extractFirstLine = (text: string) => {
            if (!text) return '';
            const lines = text.split('\n').map(l => l.trim()).filter(l => l);
            if (lines.length === 0) return '';
            return lines[0].replace(/^[0-9\.\-\s•]+/, '').trim();
        };

        const groupedEntries: DailyJournalEntry[] = [];
        let currentSubject = '';
        let startSlot = '';
        let endSlot = '';
        
        const findContent = (subjName: string) => {
            const normalizedName = subjName.trim().toLowerCase();

            if (normalizedName === 'upacara' || normalizedName === 'upacara bendera') {
                return { tp: '-', materi: '-', keterangan: '' };
            }

            if (!enabledSubjects.has(subjName)) {
                return { tp: '-', materi: '-', keterangan: 'Diisi Guru Mapel' };
            }

            const rows = prosemCache.get(subjName);
            if (!rows) return { tp: '', materi: '', keterangan: '' };
            
            const dateMatchRow = rows.find(r => r.keterangan && r.keterangan.includes(prosemDateStr));
            if (dateMatchRow) {
                return { tp: extractFirstLine(dateMatchRow.atp), materi: dateMatchRow.lingkupMateri, keterangan: '' };
            }

            const activeRow = rows.find(r => r.pekan[prosemKey] === true);
            if (activeRow) {
                return { tp: extractFirstLine(activeRow.atp), materi: activeRow.lingkupMateri, keterangan: '' };
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

    const generatePDF = async (mode: 'daily' | 'weekly' | 'monthly' | 'semester' | 'custom') => {
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
            } else if (mode === 'custom') {
                const start = new Date(startDateRange);
                const end = new Date(endDateRange);
                if (start > end) {
                    setNotification({ message: 'Tanggal mulai tidak boleh lebih besar dari tanggal selesai.', type: 'error' });
                    setIsGeneratingPDF(false);
                    return;
                }
                for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                    datesToPrint.push(getLocalDateString(d));
                }
            }

            for (const dateStr of datesToPrint) {
                if (semesterHolidayDates.has(dateStr)) continue;

                const data = getJournalDataForDate(dateStr);
                if (data.dayName === 'minggu') continue;
                if (data.isHoliday && data.holidayDesc && data.holidayDesc.toLowerCase().includes('libur semester')) continue;

                // --- HEIGHT CALCULATION ---
                const isSpecialDay = data.isHoliday || data.isEvent;
                const baseBlockHeaderHeight = 12 + 7 + 5; 
                const signatureHeight = 50; // Ditingkatkan agar muat konten 4cm
                
                let totalEstimatedTableHeight = 0;
                data.entries.forEach(e => {
                    const tpLen = e.tujuanPembelajaran?.length || 0;
                    const matLen = e.materi?.length || 0;
                    const maxChars = Math.max(tpLen, matLen);
                    const divisor = isSpecialDay ? 30 : 55;
                    const lines = Math.max(1, Math.ceil(maxChars / divisor));
                    totalEstimatedTableHeight += (lines * 6.5); 
                });
                
                if (data.entries.length === 0) totalEstimatedTableHeight = 8;

                const totalNeeded = baseBlockHeaderHeight + totalEstimatedTableHeight + signatureHeight + 10;

                if (y + totalNeeded > pageHeight - margin.bottom) {
                    pdf.addPage();
                    y = margin.top;
                }

                // DRAW CONTENT
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(10);
                pdf.text("JURNAL HARIAN PELAKSANAAN PEMBELAJARAN", pageWidth / 2, y, { align: 'center' });
                y += 5;
                
                pdf.setFontSize(9);
                pdf.setFont('helvetica', 'normal');
                pdf.text(`Hari/Tanggal: ${data.formattedDate}`, margin.left, y);
                
                if (data.isHoliday) {
                    pdf.setTextColor(220, 38, 38); 
                    if (!data.entries.length || (data.entries.length === 1 && data.entries[0].mapel === '-')) {
                         pdf.text(`( ${data.holidayDesc || 'Libur'} )`, margin.left + 85, y);
                    }
                    pdf.setTextColor(0, 0, 0);
                }
                y += 2;

                const head = [['No', 'Jam Ke-', 'Mata Pelajaran', 'Tujuan Pembelajaran', 'Materi', 'Ket']];
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

                const columnStyles: any = isSpecialDay ? {
                    0: { cellWidth: 8, halign: 'center' },
                    1: { cellWidth: 15, halign: 'center' },
                    2: { cellWidth: 30 },
                    3: { cellWidth: 40 }, 
                    4: { cellWidth: 30 }, 
                    5: { cellWidth: 62 }  
                } : {
                    0: { cellWidth: 8, halign: 'center' },
                    1: { cellWidth: 15, halign: 'center' },
                    2: { cellWidth: 30 },
                    3: { cellWidth: 75 },
                    4: { cellWidth: 40 },
                    5: { cellWidth: 17 }
                };

                (pdf as any).autoTable({
                    head: head,
                    body: body,
                    startY: y,
                    theme: 'grid',
                    headStyles: {
                        fillColor: [240, 240, 240],
                        textColor: 0,
                        fontStyle: 'bold',
                        halign: 'center',
                        lineWidth: 0.1,
                        lineColor: 0
                    },
                    styles: {
                        fontSize: 8.5,
                        lineColor: 0,
                        lineWidth: 0.1,
                        cellPadding: 1.2,
                        valign: 'top',
                        textColor: 0
                    },
                    columnStyles: columnStyles,
                    margin: { left: margin.left, right: margin.right },
                });

                y = (pdf as any).lastAutoTable.finalY + 6;

                // SIGNATURES - Tinggi diatur tepat 4cm (40mm) dari "Mengetahui" sampai baris "NIP."
                if ((!data.isHoliday && data.entries.length > 0) || data.isEvent) {
                    const teacherX = pageWidth - margin.right - 50;
                    const principalX = margin.left + 10;

                    pdf.setFontSize(8.5);
                    pdf.setFont('helvetica', 'normal');
                    // Line 1: Mengetahui
                    pdf.text('Mengetahui,', principalX, y);
                    pdf.text('Kepala Sekolah', principalX, y + 5);
                    
                    pdf.text(`Guru Kelas ${selectedClass.replace('Kelas ', '')}`, teacherX, y + 5);

                    pdf.setFont('helvetica', 'bold');
                    // Line 3: Name (y + 35) -> Menghasilkan spasi kosong setinggi 3cm untuk tanda tangan
                    const nameY = y + 35;
                    pdf.text(schoolIdentity.principalName, principalX, nameY);
                    pdf.text(teacher.fullName, teacherX, nameY);

                    pdf.setFont('helvetica', 'normal');
                    // Line 4: NIP (y + 40) -> Total tinggi dari y ke y+40 adalah tepat 4cm
                    const nipY = nameY + 5;
                    pdf.text(`NIP. ${schoolIdentity.principalNip}`, principalX, nipY);
                    pdf.text(`NIP. ${teacher.nip}`, teacherX, nipY);
                    
                    y = nipY + 6; 
                } else {
                    y += 4;
                }
                
                pdf.setDrawColor(200, 200, 200);
                pdf.setLineWidth(0.2);
                pdf.line(margin.left, y, pageWidth - margin.right, y);
                y += 6; 
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
            <div className="flex flex-col mb-8 gap-6 border-b pb-6">
                <div className="flex flex-col xl:flex-row justify-between items-end gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full xl:w-auto">
                        <div>
                            <label className="block text-xs font-bold text-indigo-700 uppercase mb-1">Pratinjau Tanggal</label>
                            <div className="flex items-center gap-2">
                                <input 
                                    type="date" 
                                    value={selectedDate} 
                                    onChange={(e) => setSelectedDate(e.target.value)} 
                                    className="block w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-indigo-50/30"
                                />
                                <div className="px-3 py-2 bg-indigo-100 border border-indigo-200 rounded-md text-xs font-black text-indigo-700 whitespace-nowrap">
                                    SEM. {selectedSemester.toUpperCase()}
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Dari Tanggal</label>
                                <input 
                                    type="date" 
                                    value={startDateRange} 
                                    onChange={(e) => setStartDateRange(e.target.value)} 
                                    className="block w-full p-2 border border-gray-300 rounded-md text-sm"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Sampai Tanggal</label>
                                <input 
                                    type="date" 
                                    value={endDateRange} 
                                    onChange={(e) => setEndDateRange(e.target.value)} 
                                    className="block w-full p-2 border border-gray-300 rounded-md text-sm"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="relative w-full md:w-auto">
                        <button 
                            onClick={() => setIsPdfMenuOpen(!isPdfMenuOpen)} 
                            disabled={isGeneratingPDF}
                            className="inline-flex justify-center items-center w-full md:w-auto px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:outline-none shadow-md transition-all disabled:bg-indigo-400"
                        >
                            {isGeneratingPDF ? (
                                <span className="flex items-center"><svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Memproses...</span>
                            ) : (
                                <span className="flex items-center"><PrinterIcon className="w-5 h-5 mr-2" /> OPSI CETAK JURNAL <ChevronDownIcon className="w-4 h-4 ml-2"/></span>
                            )}
                        </button>
                        {isPdfMenuOpen && (
                            <div className="absolute right-0 mt-2 w-64 origin-top-right bg-white divide-y divide-gray-100 rounded-xl shadow-2xl ring-1 ring-black ring-opacity-5 focus:outline-none z-50 border border-gray-100 overflow-hidden">
                                <div className="px-1 py-1">
                                    <button onClick={() => generatePDF('daily')} className="group flex items-center w-full px-4 py-3 text-sm text-gray-700 hover:bg-indigo-600 hover:text-white transition-colors">
                                        <CalendarIcon className="w-4 h-4 mr-3 opacity-50 group-hover:opacity-100"/>
                                        Cetak Harian (Tanggal Aktif)
                                    </button>
                                    <button onClick={() => generatePDF('custom')} className="group flex items-center w-full px-4 py-3 text-sm text-indigo-700 font-bold hover:bg-indigo-600 hover:text-white transition-colors bg-indigo-50">
                                        <SparklesIcon className="w-4 h-4 mr-3"/>
                                        Cetak Rentang Tanggal
                                    </button>
                                </div>
                                <div className="px-1 py-1">
                                    <button onClick={() => generatePDF('weekly')} className="group flex items-center w-full px-4 py-3 text-sm text-gray-700 hover:bg-indigo-600 hover:text-white transition-colors">Cetak Minggu Ini</button>
                                    <button onClick={() => generatePDF('monthly')} className="group flex items-center w-full px-4 py-3 text-sm text-gray-700 hover:bg-indigo-600 hover:text-white transition-colors">Cetak Bulan Ini</button>
                                </div>
                                <div className="px-1 py-1">
                                    <button onClick={() => generatePDF('semester')} className="group flex items-center w-full px-4 py-3 text-sm text-gray-700 hover:bg-indigo-600 hover:text-white transition-colors font-semibold">Cetak Full 1 Semester</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 shadow-sm transition-all">
                    <h4 className="text-xs font-black text-indigo-800 uppercase mb-3 flex items-center gap-2 tracking-tighter">
                        <SparklesIcon className="w-3 h-3"/> Otomatisasi Jurnal (Pilih Mata Pelajaran):
                    </h4>
                    <div className="flex flex-wrap gap-2">
                        {subjects.map(subj => (
                            <label key={subj.id} className={`flex items-center space-x-2 px-3 py-1.5 rounded-full border transition-all shadow-sm cursor-pointer ${enabledSubjects.has(subj.name) ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                                <input 
                                    type="checkbox" 
                                    checked={enabledSubjects.has(subj.name)} 
                                    onChange={() => toggleSubject(subj.name)}
                                    className="hidden"
                                />
                                <span className="text-[11px] font-bold uppercase">{subj.name}</span>
                            </label>
                        ))}
                    </div>
                </div>
            </div>

            {/* Journal Preview */}
            <div className="bg-gray-100 border border-gray-300 p-4 md:p-8 rounded-xl shadow-inner print-preview">
                <div className="max-w-[1000px] mx-auto bg-white p-6 md:p-12 shadow-2xl rounded-sm border border-gray-200 min-h-[600px]">
                    <div className="text-center mb-10">
                        <h2 className="text-xl font-black text-gray-900 uppercase tracking-widest underline decoration-4 underline-offset-8 decoration-indigo-200">JURNAL HARIAN PEMBELAJARAN</h2>
                    </div>

                    <div className="mb-6 text-gray-800 font-bold text-lg flex items-center gap-3">
                        <div className="bg-indigo-600 text-white p-2 rounded-lg shadow-md"><CalendarIcon className="w-6 h-6"/></div>
                        <span className="border-b-2 border-dashed border-gray-300 pb-1">{currentJournalData.formattedDate}</span>
                    </div>

                    {currentJournalData.isHoliday && !currentJournalData.isEvent && !currentJournalData.entries.length ? (
                        <div className="py-20 text-center bg-red-50 border-2 border-dashed border-red-200 rounded-2xl text-red-600">
                            <XCircleIcon className="w-16 h-16 mx-auto mb-4 opacity-30"/>
                            <p className="font-black text-xl uppercase tracking-tighter">{currentJournalData.holidayDesc}</p>
                            <p className="text-sm mt-2 text-red-400">Tidak ada kegiatan belajar mengajar terjadwal.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse border-2 border-black text-sm shadow-lg rounded-sm overflow-hidden">
                                <thead className="bg-gray-900 text-white text-center font-bold">
                                    <tr>
                                        <th className="border border-black p-4 w-10">No</th>
                                        <th className="border border-black p-4 w-24">Jam Ke-</th>
                                        <th className="border border-black p-4 w-1/5">Mata Pelajaran</th>
                                        <th className="border border-black p-4 w-1/4">Tujuan Pembelajaran</th>
                                        <th className="border border-black p-4 w-1/4">Materi</th>
                                        <th className="border border-black p-4">Ket</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentJournalData.entries.length > 0 ? (
                                        currentJournalData.entries.map((entry, index) => (
                                            <tr key={index} className="bg-white hover:bg-indigo-50/50 transition-colors">
                                                <td className="border border-gray-300 p-3 text-center align-top font-bold text-gray-400">{entry.no}</td>
                                                <td className="border border-gray-300 p-3 text-center align-top font-mono bg-gray-50">{entry.jamKe}</td>
                                                <td className="border border-gray-300 p-3 align-top font-black text-indigo-900 uppercase tracking-tighter leading-tight">{entry.mapel}</td>
                                                <td className="border border-gray-300 p-3 align-top whitespace-pre-wrap text-xs leading-relaxed text-gray-700">
                                                    {entry.tujuanPembelajaran || <span className="text-red-400 italic">Data Prosem Kosong</span>}
                                                </td>
                                                <td className="border border-gray-300 p-3 align-top whitespace-pre-wrap text-xs font-bold text-gray-800 leading-relaxed">
                                                    {entry.materi || <span className="text-red-400 italic">Data Prosem Kosong</span>}
                                                </td>
                                                <td className="border border-gray-300 p-3 align-top font-bold text-blue-600 text-xs italic text-center">
                                                    {entry.keterangan}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={6} className="border border-black p-12 text-center text-gray-400 italic bg-gray-50">
                                                Tidak ada jadwal pelajaran. Periksa menu "Jadwal Pelajaran" Anda.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {(!currentJournalData.isHoliday || currentJournalData.entries.length > 0 || currentJournalData.isEvent) && (
                        <div className="flex justify-between mt-16 px-6">
                            <div className="text-center">
                                <p className="text-sm font-bold text-gray-500 mb-1">Mengetahui,</p>
                                <p className="font-black text-gray-800 uppercase tracking-widest text-xs">Kepala Sekolah</p>
                                <div className="h-24"></div>
                                <p className="font-black text-gray-900 border-b-2 border-black inline-block px-4">{schoolIdentity?.principalName || '..............................'}</p>
                                <p className="text-[10px] mt-1 text-gray-500">NIP. {schoolIdentity?.principalNip || '..............................'}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-bold text-gray-500 mb-1">&nbsp;</p>
                                <p className="font-black text-gray-800 uppercase tracking-widest text-xs">Guru Kelas {selectedClass.replace('Kelas ', '')}</p>
                                <div className="h-24"></div>
                                <p className="font-black text-gray-900 border-b-2 border-black inline-block px-4">{teacher?.fullName || '..............................'}</p>
                                <p className="text-[10px] mt-1 text-gray-500">NIP. {teacher?.nip || '..............................'}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default JurnalPembelajaran;
