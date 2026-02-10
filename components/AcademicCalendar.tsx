import React, { useState, useEffect, useMemo, FormEvent } from 'react';
import { SchoolIdentity, AcademicEvent, Teacher } from '../types';
import { getSchoolIdentity, getCalendarEvents, saveCalendarEvents, getTeacherProfile, pullCalendarDataToTeacher } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { XMarkIcon, ArrowDownTrayIcon, SparklesIcon, ArrowPathIcon, ExclamationTriangleIcon } from './Icons';

declare const jspdf: any;

interface AcademicCalendarProps {
    selectedClass: string;
    selectedYear: string;
    userId?: string;
}

const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

interface Day {
    fullDate: string; // YYYY-MM-DD
    date: number;
    isCurrentMonth: boolean;
    isSunday: boolean;
    events: AcademicEvent[];
}

// --- Event Classification Logic ---
const LHB_KEYWORDS = ['hut', 'maulid', 'natal', 'tahun baru masehi', 'isra', 'imlek', 'nyepi', 'idul fitri', 'idul adha', 'wafat yesus', 'buruh internasional', 'kenaikan yesus', 'waisak', 'lahir pancasila', 'tahun baru islam'];
const LIBUR_BIASA_KEYWORDS = ['libur semester', 'libur sekitar hari raya'];
const CUTI_KEYWORDS = ['cuti bersama'];
const PENILAIAN_KEYWORDS = ['sumatif tengah semester', 'sumatif akhir semester', 'sumatif akhir tahun'];

type EventCategory = 'LHB' | 'LIBUR_BIASA' | 'CUTI' | 'PENILAIAN' | 'KEGIATAN';

const getEventCategory = (event: AcademicEvent): EventCategory | null => {
    const desc = event.description.toLowerCase();
    
    // Explicitly check for assessment type first as some descriptions might overlap
    if (event.type === 'assessment' || PENILAIAN_KEYWORDS.some(k => desc.includes(k))) {
        return 'PENILAIAN';
    }

    if (event.type === 'holiday') {
        // Corrected order: Check for more specific holiday types first before general LHB keywords.
        if (CUTI_KEYWORDS.some(k => desc.includes(k))) return 'CUTI';
        if (LIBUR_BIASA_KEYWORDS.some(k => desc.includes(k))) return 'LIBUR_BIASA';
        if (LHB_KEYWORDS.some(k => desc.includes(k))) return 'LHB';
        return 'LIBUR_BIASA'; // Fallback for other holidays
    }
    
    if (event.type === 'event') {
        return 'KEGIATAN';
    }
    return null;
};

// FIX: Extracted logic to a reusable function to be used by YearlyCalendarView and handleDownloadYearlyPDF
const getYearlyCalendarData = (events: AcademicEvent[], selectedYear: string) => {
    const [startYear] = selectedYear.split('/').map(Number);
    const months = [];
    // Loop 12 times for a 12-month academic year (July to June)
    for (let i = 0; i < 12; i++) {
        const date = new Date(startYear, 6 + i, 1);
        months.push({ name: monthNames[date.getMonth()], year: date.getFullYear(), monthIndex: date.getMonth() });
    }

    let sem1EffectiveDayCounter = 0;
    let sem2EffectiveDayCounter = 0;
    const processedHolidayList = new Map<string, string>();

    const data = months.map(month => {
        const daysInMonth = new Date(month.year, month.monthIndex + 1, 0).getDate();
        const monthDays = Array.from({ length: 31 }, (_, i) => {
            const day = i + 1;
            if (day > daysInMonth) return { content: '', style: 'bg-gray-200' };

            const currentDate = new Date(month.year, month.monthIndex, day);
            const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayEvents = events.filter(e => e.date === dateStr);
            const isSunday = currentDate.getDay() === 0;

            const dayCategories = new Set<EventCategory | 'SUNDAY'>();
            if (isSunday) dayCategories.add('SUNDAY');
            dayEvents.forEach(e => {
                const cat = getEventCategory(e);
                if (cat) dayCategories.add(cat);
            });

            const priorityOrder: (EventCategory | 'SUNDAY')[] = ['LHB', 'SUNDAY', 'CUTI', 'LIBUR_BIASA', 'PENILAIAN', 'KEGIATAN'];
            let highestPriorityCategory: EventCategory | 'SUNDAY' | null = null;
            for (const cat of priorityOrder) {
                if (dayCategories.has(cat)) {
                    highestPriorityCategory = cat;
                    break;
                }
            }

            const styleBase = 'text-white font-bold text-xs p-1';

            switch (highestPriorityCategory) {
                case 'LHB':
                    const lhbEvent = dayEvents.find(e => getEventCategory(e) === 'LHB');
                    if (lhbEvent && !processedHolidayList.has(dateStr)) {
                        processedHolidayList.set(dateStr, lhbEvent.description);
                    }
                    return { content: 'LHB', style: `bg-red-500 ${styleBase}` };
                case 'SUNDAY':
                    return { content: 'LU', style: `bg-red-500 ${styleBase}` };
                case 'CUTI':
                    return { content: 'CB', style: `bg-yellow-400 text-black font-bold text-xs p-1` };
                case 'LIBUR_BIASA':
                    const liburEvent = dayEvents.find(e => getEventCategory(e) === 'LIBUR_BIASA');
                    const desc = liburEvent?.description.toLowerCase() || '';
                    if (desc.includes('libur semester genap')) return { content: 'LS2', style: `bg-gray-400 ${styleBase}` };
                    if (desc.includes('libur semester ganjil')) return { content: 'LS1', style: `bg-gray-400 ${styleBase}` };
                    if (desc.includes('libur sekitar hari raya')) return { content: 'LHR', style: `bg-orange-500 ${styleBase}` };
                    return { content: 'LB', style: `bg-orange-500 ${styleBase}` };
                case 'PENILAIAN':
                    const penEvent = dayEvents.find(e => getEventCategory(e) === 'PENILAIAN');
                    const pDesc = penEvent?.description.toLowerCase() || '';
                    if (pDesc.includes('sumatif akhir tahun')) return { content: 'SAT', style: `bg-blue-500 ${styleBase}` };
                    if (pDesc.includes('sumatif akhir semester')) return { content: 'SAS', style: `bg-blue-500 ${styleBase}` };
                    if (pDesc.includes('sumatif tengah semester')) return { content: 'STS', style: `bg-blue-500 ${styleBase}` };
                    return { content: 'PNL', style: `bg-blue-500 ${styleBase}` };
                case 'KEGIATAN':
                     const kegEvent = dayEvents.find(e => getEventCategory(e) === 'KEGIATAN');
                     const kDesc = kegEvent?.description.toLowerCase() || '';
                     if (kDesc.includes('kegiatan permulaan puasa')) return { content: 'KPP', style: `bg-orange-500 ${styleBase}` };
                     if (kDesc.includes('kegiatan tengah semester')) return { content: 'KTS', style: `bg-green-500 ${styleBase}` };
                     if (kDesc.includes('mpls') || kDesc.includes('masa pengenalan lingkungan sekolah')) return { content: 'MPS', style: `bg-green-500 ${styleBase}` };
                     if (['koreksi', 'pengolahan rapor', 'pembagian rapor'].some(k => kDesc.includes(k))) {
                        return { content: 'KOR', style: `bg-green-500 ${styleBase}` };
                     }
                    return { content: 'KS', style: `bg-green-500 ${styleBase}` };
                default:
                    let effectiveDayNumber;
                    if (currentDate.getMonth() >= 6 && currentDate.getMonth() <= 11) {
                         sem1EffectiveDayCounter++;
                         effectiveDayNumber = sem1EffectiveDayCounter;
                    } else {
                         sem2EffectiveDayCounter++;
                         effectiveDayNumber = sem2EffectiveDayCounter;
                    }
                    return { content: effectiveDayNumber, style: 'bg-white text-gray-800 text-xs p-1' };
            }
        });
        return { ...month, days: monthDays };
    });
    
    const sortedHolidays = Array.from(processedHolidayList.entries()).sort(([aDate]: [string, string], [bDate]: [string, string]) => new Date(aDate).getTime() - new Date(bDate).getTime());

    const formattedHolidayList = sortedHolidays.map(([date, desc]) => ({
         date: new Date(date + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric'}),
         description: desc
    }));

    const legend: { [key: string]: { label: string; color: string } } = {
        'LHB': { label: 'Libur Hari Besar', color: 'bg-red-500' },
        'LU': { label: 'Libur Umum', color: 'bg-red-500' },
        'LS1': { label: 'Libur Semester 1', color: 'bg-gray-400' },
        'LS2': { label: 'Libur Semester 2', color: 'bg-gray-400' },
        'CB': { label: 'Cuti Bersama', color: 'bg-yellow-400' },
        'LHR': { label: 'Libur Sekitar Hari Raya', color: 'bg-orange-500' },
        'LB': { label: 'Libur Biasa', color: 'bg-orange-500' },
        'KPP': { label: 'Kegiatan Awal Puasa', color: 'bg-orange-500' },
        'KOR': { label: 'Koreksi & Olah Rapor', color: 'bg-green-500' },
        'KS': { label: 'Kegiatan Sekolah', color: 'bg-green-500' },
        'KTS': { label: 'Kegiatan Tengah Semester', color: 'bg-green-500' },
        'MPS': { label: 'Masa Pengenalan Lingkungan Sekolah', color: 'bg-green-500' },
        'PNL': { label: 'Penilaian', color: 'bg-blue-500' },
        'STS': { label: 'Sumatif Tengah Semester', color: 'bg-blue-500' },
        'SAS': { label: 'Sumatif Akhir Semester', color: 'bg-blue-500' },
        'SAT': { label: 'Sumatif Akhir Tahun', color: 'bg-blue-500' },
    };
    
    const order = ['LHB', 'LU', 'LS1', 'LS2', 'CB', 'LHR', 'LB', 'KPP', 'KOR', 'KS', 'KTS', 'MPS', 'PNL', 'STS', 'SAS', 'SAT'];
    
    return {
        tableData: data,
        effectiveDaysSummary: { sem1: sem1EffectiveDayCounter, sem2: sem2EffectiveDayCounter },
        holidayList: formattedHolidayList,
        legendItems: legend,
        legendOrder: order,
    };
};


// ===================================================================================
// Yearly Calendar View Component (for "Semua Semester" tab)
// ===================================================================================
const YearlyCalendarView: React.FC<{ events: AcademicEvent[]; selectedYear: string; schoolIdentity: SchoolIdentity | null }> = ({ events, selectedYear, schoolIdentity }) => {
    
    const { tableData, effectiveDaysSummary, holidayList, legendItems, legendOrder } = useMemo(() => {
        return getYearlyCalendarData(events, selectedYear);
    }, [events, selectedYear]);

    return (
        <div>
             <div className="text-center mb-6">
                <h1 className="text-xl font-bold">HARI EFEKTIF, KEGIATAN SEKOLAH, DAN HARI LIBUR</h1>
                <h2 className="text-lg font-semibold">TAHUN AJARAN {selectedYear}</h2>
                <h3 className="text-lg font-semibold">{schoolIdentity?.schoolName.toUpperCase() || 'NAMA SEKOLAH'}</h3>
            </div>
            <div className="overflow-x-auto border border-gray-400">
                <table className="min-w-full text-xs border-collapse">
                    <thead className="bg-gray-200 text-center font-bold">
                        <tr>
                            <th className="border border-gray-400 p-1" rowSpan={2}>No</th>
                            <th className="border border-gray-400 p-1" rowSpan={2}>BULAN</th>
                            <th className="border border-gray-400 p-1" colSpan={31}>TANGGAL</th>
                        </tr>
                        <tr>
                            {Array.from({ length: 31 }, (_, i) => <th key={i} className="border border-gray-400 p-1 w-8">{i + 1}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {tableData.map((month, index) => (
                            <tr key={month.name + month.year} className="text-center">
                                <td className="border border-gray-400 p-1 font-bold">{index + 1}</td>
                                <td className="border border-gray-400 p-1 text-left font-bold" style={{minWidth: '13ch'}}>{month.name.toUpperCase()} {month.year}</td>
                                {month.days.map((day, dayIndex) => (
                                    <td key={dayIndex} className={`border border-gray-400 ${day.style}`}>{day.content}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            <div className="mt-6 text-sm">
                {/* Block 1: Legend */}
                <div className="border-t border-gray-400 py-4">
                    <h4 className="font-bold mb-2">KETERANGAN</h4>
                    <div className="grid grid-cols-5 gap-x-4 gap-y-2">
                        {legendOrder.map(code => {
                            const item = legendItems[code as keyof typeof legendItems];
                            if (!item) return null;
                            const { label, color } = item as { label: string; color: string };
                            return (
                                <div key={code} className="flex items-center">
                                    <div className={`w-10 text-center p-1 font-bold text-xs ${color} ${code === 'CB' ? 'text-black' : 'text-white'}`}>{code}</div>
                                    <span className="ml-2 text-xs">: {label}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Block 2: Effective Days Summary */}
                <div className="border-t border-gray-400 py-4">
                    <p>Hari efektif Semester Ganjil : {effectiveDaysSummary.sem1} hari / {Math.round(effectiveDaysSummary.sem1 / 6)} pekan</p>
                    <p>Hari efektif Semester Genap : {effectiveDaysSummary.sem2} hari / {Math.round(effectiveDaysSummary.sem2 / 6)} pekan</p>
                </div>

                {/* Block 3: Public Holidays */}
                <div className="border-t border-b border-gray-400 py-4">
                    <h4 className="font-bold mb-2">Libur Hari Besar</h4>
                    <div className="grid grid-cols-4 gap-x-8 gap-y-1 text-xs">
                        {holidayList.map(h => (
                            <div key={h.date}>{h.date} : {h.description}</div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};


// ===================================================================================
// Monthly Calendar View Component (for Semester I & II tabs)
// ===================================================================================
const generateMonthData = (year: number, month: number, events: AcademicEvent[]): Day[][] => {
    const weeks: Day[][] = [];
    const firstDay = new Date(year, month, 1);
    new Date(year, month + 1, 0);

    let currentDate = new Date(firstDay);
    currentDate.setDate(currentDate.getDate() - firstDay.getDay());

    for (let i = 0; i < 6; i++) {
        const week: Day[] = [];
        for (let j = 0; j < 7; j++) {
            const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
            const dayEvents = events.filter(e => e.date === dateStr);
            
            week.push({
                fullDate: dateStr,
                date: currentDate.getDate(),
                isCurrentMonth: currentDate.getMonth() === month,
                isSunday: currentDate.getDay() === 0,
                events: dayEvents
            });
            currentDate.setDate(currentDate.getDate() + 1);
        }
        weeks.push(week);
        if (currentDate.getMonth() !== month && weeks.length >= 4 && week[0].date > 20) break;
    }
    return weeks;
};

interface MonthCalendarProps {
    year: number;
    month: number;
    events: AcademicEvent[];
    onDateClick: (day: Day) => void;
}

const MonthCalendar: React.FC<MonthCalendarProps> = ({ year, month, events, onDateClick }) => {
    const monthData = generateMonthData(year, month, events);
    const monthEvents = events.filter(e => new Date(e.date).getMonth() === month && new Date(e.date).getFullYear() === year);
    
    // STABILITY FIX: Add explicit type to accumulator in reduce to prevent type inference issues.
    const groupedEvents = monthEvents.reduce((acc: Record<string, { dates: number[] }>, curr) => {
        if (!acc[curr.description]) {
            acc[curr.description] = { dates: [] };
        }
        acc[curr.description].dates.push(new Date(curr.date).getDate());
        return acc;
    // STABILITY FIX: The initial value for reduce was an untyped `{}`, causing type inference issues.
    // By casting it to the correct type, we ensure `groupedEvents` and its derived variables are correctly typed.
    }, {} as Record<string, { dates: number[] }>);

    const sortedLegendItems = Object.entries(groupedEvents)
        // FIX: Explicitly type the destructured map parameters to resolve type inference issues where `data` was inferred as `unknown`.
        .map(([description, data]: [string, { dates: number[] }]) => {
            const sortedDates = [...new Set(data.dates)].sort((a, b) => a - b);
            // STABILITY FIX: Add explicit type to accumulator in reduce to prevent type inference issues.
            const ranges = sortedDates.reduce((r: number[][], n) => {
                const last = r[r.length - 1];
                if (last && last[last.length - 1] === n - 1) {
                    last.push(n);
                } else {
                    r.push([n]);
                }
                return r;
            }, [] as number[][]).map(range => range.length > 1 ? `${range[0]}-${range[range.length - 1]}` : `${range[0]}`).join(', ');
            
            return {
                description,
                ranges,
                minDate: sortedDates[0],
            };
        })
        .sort((a, b) => a.minDate - b.minDate);


    return (
        <div className="w-full md:w-1/2 p-2">
            <div className="border border-gray-300">
                <h3 className="text-center font-bold py-2 bg-gray-100">{monthNames[month]} {year}</h3>
                <table className="w-full border-collapse">
                    <thead>
                        <tr>
                            {dayNames.map((day, index) => (
                                <th key={day} className={`p-2 border border-gray-300 text-sm ${index === 0 ? 'text-red-500' : ''}`}>
                                    {day}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {monthData.map((week, weekIndex) => (
                            <tr key={weekIndex}>
                                {week.map((day, dayIndex) => {
                                    const dayCategories = new Set<string>();
                                    if (day.isSunday) dayCategories.add('SUNDAY');
                                    day.events.forEach(e => {
                                        const cat = getEventCategory(e);
                                        if(cat) dayCategories.add(cat);
                                    });

                                    let highestPriorityCategory = '';
                                    const priorityOrder = ['LHB', 'SUNDAY', 'CUTI', 'LIBUR_BIASA', 'PENILAIAN', 'KEGIATAN'];
                                    for (const cat of priorityOrder) {
                                        if (dayCategories.has(cat)) {
                                            highestPriorityCategory = cat;
                                            break;
                                        }
                                    }

                                    let tdClasses = 'p-0 border border-gray-300 text-center h-12 text-sm align-middle relative';
                                    let dateNumberWrapperClasses = '';
                                    let dateNumberClasses = '';

                                    if (!day.isCurrentMonth) {
                                        tdClasses += ' bg-gray-50';
                                        dateNumberClasses = 'text-gray-400';
                                    } else {
                                        tdClasses += ' cursor-pointer hover:bg-blue-100 transition-colors';
                                        if (day.isSunday) {
                                            tdClasses += ' bg-gray-200';
                                        }
                                
                                        const dateWrapperBase = 'w-8 h-8 flex items-center justify-center rounded-full';
                                
                                        switch (highestPriorityCategory) {
                                            case 'LHB':
                                                dateNumberWrapperClasses = `${dateWrapperBase} bg-red-500`;
                                                dateNumberClasses = 'text-black font-bold';
                                                break;
                                            case 'LIBUR_BIASA':
                                                dateNumberWrapperClasses = `${dateWrapperBase} bg-orange-500`;
                                                dateNumberClasses = 'text-black font-bold';
                                                break;
                                            case 'CUTI':
                                                dateNumberWrapperClasses = `${dateWrapperBase} bg-yellow-400`;
                                                dateNumberClasses = 'text-black font-bold';
                                                break;
                                            case 'PENILAIAN':
                                                dateNumberWrapperClasses = `${dateWrapperBase} bg-blue-500`;
                                                dateNumberClasses = 'text-black font-bold';
                                                break;
                                            case 'KEGIATAN':
                                                dateNumberWrapperClasses = `${dateWrapperBase} bg-green-400`;
                                                dateNumberClasses = 'text-black font-bold';
                                                break;
                                            case 'SUNDAY':
                                                dateNumberClasses = 'text-red-600';
                                                break;
                                        }
                                    }

                                    return (
                                        <td key={dayIndex} className={tdClasses} onClick={() => day.isCurrentMonth && onDateClick(day)}>
                                            {dateNumberWrapperClasses ? (
                                                <div className="flex justify-center items-center h-full">
                                                    <div className={dateNumberWrapperClasses}>
                                                        <span className={dateNumberClasses}>{day.date}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className={dateNumberClasses}>{day.date}</span>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
                 {sortedLegendItems.length > 0 && (
                    <div className="p-2 border-t text-sm bg-gray-50">
                        <h4 className="font-bold mb-1">Keterangan:</h4>
                        <ul>
                           {sortedLegendItems.map(({ description, ranges }) => (
                                <li key={description} className="mt-1 text-xs text-black">
                                    <strong>{ranges} {monthNames[month]}</strong>: {description}
                                </li>
                           ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
};

// ===================================================================================
// Main Academic Calendar Component
// ===================================================================================

// Type definition for jsPDF-autotable's didParseCell hook data object
interface jsPDFAutoTableCell {
  row: { index: number };
  column: { index: number };
  cell: { styles: { textColor?: [number, number, number] } };
}

const AcademicCalendar: React.FC<AcademicCalendarProps> = ({ selectedClass, selectedYear, userId }) => {
    const [activeTab, setActiveTab] = useState<'semester1' | 'semester2' | 'all'>('semester1');
    const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity | null>(null);
    const [teacher, setTeacher] = useState<Teacher | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isPulling, setIsPulling] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    
    // Event State
    const [events, setEvents] = useState<AcademicEvent[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isPullModalOpen, setIsPullModalOpen] = useState(false); // New state for confirmation modal
    const [selectedDay, setSelectedDay] = useState<Day | null>(null);
    const [eventFormData, setEventFormData] = useState({ description: '', type: 'event', endDate: '' });
    const [originalEventDescription, setOriginalEventDescription] = useState<string | null>(null);
    const [eventStartDate, setEventStartDate] = useState('');
    const [signatureDate, setSignatureDate] = useState(new Date().toISOString().split('T')[0]);
    const [isPdfDropdownOpen, setIsPdfDropdownOpen] = useState(false);

    const [startYear, endYear] = selectedYear.split('/').map(Number);
    
    useEffect(() => {
        const fetchAllData = async () => {
            setIsLoading(true);
            try {
                const [identity, calendarEvents, teacherData] = await Promise.all([
                    getSchoolIdentity(userId),
                    getCalendarEvents(selectedYear, userId),
                    getTeacherProfile(selectedYear, selectedClass, userId)
                ]);
                setSchoolIdentity(identity);
                setEvents(calendarEvents);
                setTeacher(teacherData);
            } catch (error) {
                console.error("Failed to fetch data:", error);
                setNotification({ message: 'Gagal memuat data kalender.', type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchAllData();
    }, [selectedYear, selectedClass, userId]);
    
    const handlePullFromMaster = () => {
        if (!userId) return;
        setIsPullModalOpen(true);
    };

    const executePullFromMaster = async () => {
        if (!userId) return;
        setIsPulling(true);
        setNotification(null);
        
        try {
            const masterEvents = await pullCalendarDataToTeacher(selectedYear, userId);
            setEvents(masterEvents);
            setNotification({ message: 'Kalender berhasil disinkronkan dengan data Induk!', type: 'success' });
            setIsPullModalOpen(false);
        } catch (error: any) {
            setNotification({ message: 'Gagal menarik data: ' + error.message, type: 'error' });
        } finally {
            setIsPulling(false);
        }
    };

    const getFormTypeFromEvent = (event: AcademicEvent): string => {
        const cat = getEventCategory(event);
        switch (cat) {
            case 'KEGIATAN': return 'event';
            case 'PENILAIAN': return 'assessment';
            case 'LHB': return 'holiday-lhb';
            case 'LIBUR_BIASA': return 'holiday-biasa';
            case 'CUTI': return 'holiday-cuti';
            default: return 'event';
        }
    };

    const handleDateClick = (day: Day) => {
        setSelectedDay(day);
        if (day.events.length > 0) {
            const priorityOrder: (EventCategory | null)[] = ['LHB', 'CUTI', 'LIBUR_BIASA', 'PENILAIAN', 'KEGIATAN'];
            let eventToEdit = day.events[0];
            for (const cat of priorityOrder) {
                const found = day.events.find(e => getEventCategory(e) === cat);
                if (found) {
                    eventToEdit = found;
                    break;
                }
            }
            
            const siblingEvents = events.filter(e => e.description === eventToEdit.description);
            const eventDates = siblingEvents.map(e => e.date);
            
            const startDate = eventDates.reduce((min, date) => date < min ? date : min, eventDates[0] || day.fullDate);
            const endDate = eventDates.reduce((max, date) => date > max ? date : max, eventDates[0] || day.fullDate);
            
            setEventStartDate(startDate); // Store the real start date
            setOriginalEventDescription(eventToEdit.description);
            setEventFormData({
                description: eventToEdit.description,
                type: getFormTypeFromEvent(eventToEdit),
                endDate: endDate,
            });
        } else {
            setEventStartDate(day.fullDate); // For new events, start date is the clicked day
            setOriginalEventDescription(null);
            setEventFormData({ description: '', type: 'event', endDate: day.fullDate });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setSelectedDay(null);
        setOriginalEventDescription(null);
        setEventStartDate(''); // Reset the start date
    };
    
    const handleEventFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setEventFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSaveEvent = async (e: FormEvent) => {
        e.preventDefault();
        if (!selectedDay || !eventFormData.description) return;
        setIsSubmitting(true);
        setNotification(null);
    
        const startDateStr = eventStartDate; // Use the stored start date
        const endDateStr = eventFormData.endDate || startDateStr;
    
        const dateRange: string[] = [];
        let currentDate = new Date(startDateStr + 'T00:00:00Z');
        const finalDate = new Date(endDateStr + 'T00:00:00Z');
    
        while(currentDate <= finalDate) {
            dateRange.push(`${currentDate.getUTCFullYear()}-${String(currentDate.getUTCMonth() + 1).padStart(2, '0')}-${String(currentDate.getUTCDate()).padStart(2, '0')}`);
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        }
    
        const typeString = eventFormData.type;
        let finalType: 'event' | 'holiday' | 'assessment';
        if (typeString.startsWith('holiday')) {
            finalType = 'holiday';
        } else if (typeString === 'assessment') {
            finalType = 'assessment';
        } else {
            finalType = 'event';
        }
    
        const newEventsForRange = dateRange.map(dateStr => ({
            id: crypto.randomUUID(),
            date: dateStr,
            description: eventFormData.description,
            type: finalType
        }));
        
        let workingEvents = [...events];
    
        // If we are editing an existing event, remove ALL instances of it first.
        if (originalEventDescription) {
            workingEvents = workingEvents.filter(e => e.description !== originalEventDescription);
        }
        
        // Now, remove any events that might conflict with the NEW date range.
        // This handles both creating a new event over existing ones, and the case where an edited event's new range overlaps with a different, unrelated event.
        workingEvents = workingEvents.filter(event => !dateRange.includes(event.date));
    
        // Add the new event(s).
        workingEvents.push(...newEventsForRange);
        
        try {
            await saveCalendarEvents(selectedYear, workingEvents, userId);
            setEvents(workingEvents);
            setNotification({ message: 'Kalender berhasil diperbarui.', type: 'success' });
            closeModal();
        } catch (error) {
             setNotification({ message: 'Gagal menyimpan acara.', type: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDeleteEvent = async () => {
        if (!selectedDay || !originalEventDescription) return;
        setIsSubmitting(true);
        setNotification(null);
        
        const descriptionToDelete = originalEventDescription;
        const updatedEvents = events.filter(e => e.description !== descriptionToDelete);
        
        try {
             await saveCalendarEvents(selectedYear, updatedEvents, userId);
             setEvents(updatedEvents);
             setNotification({ message: `Kegiatan "${descriptionToDelete}" berhasil dihapus.`, type: 'success' });
             closeModal();
        } catch (error) {
             setNotification({ message: 'Gagal menghapus acara.', type: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    }

    const semester1Months = [
        { year: startYear, month: 6 }, { year: startYear, month: 7 }, // Juli, Agustus
        { year: startYear, month: 8 }, { year: startYear, month: 9 }, // September, Oktober
        { year: startYear, month: 10 }, { year: startYear, month: 11 } // November, Desember
    ];
    const semester2Months = [
        { year: endYear, month: 0 }, { year: endYear, month: 1 }, // Januari, Februari
        { year: endYear, month: 2 }, { year: endYear, month: 3 }, // Maret, April
        { year: endYear, month: 4 }, { year: endYear, month: 5 }  // Mei, Juni
    ];

    const monthsToDisplay = useMemo(() => {
        switch (activeTab) {
            case 'semester1': return semester1Months;
            case 'semester2': return semester2Months;
            default: return [];
        }
    }, [activeTab, startYear, endYear]);
    
    const handleDownloadYearlyPDF = async (signatureOption: 'none' | 'teacher' | 'both') => {
        setIsGeneratingPDF(true);
        setNotification({ message: 'Mempersiapkan PDF, mohon tunggu...', type: 'info' });
        await new Promise(resolve => setTimeout(resolve, 50));
    
        if (!schoolIdentity || !teacher) {
            setNotification({ message: 'Gagal mendapatkan data sekolah/guru untuk PDF.', type: 'error' });
            setIsGeneratingPDF(false);
            return;
        }
    
        try {
            const { jsPDF } = jspdf;
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [330, 215] });
            const { tableData, effectiveDaysSummary, holidayList, legendItems, legendOrder } = getYearlyCalendarData(events, selectedYear);
    
            const margin = { top: 25, right: 10, bottom: 5, left: 10 };
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
    
            // Header
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(11);
            pdf.text('HARI EFEKTIF, KEGIATAN SEKOLAH, DAN HARI LIBUR', pageWidth / 2, 15, { align: 'center' });
            pdf.setFontSize(10);
            pdf.text(`TAHUN AJARAN ${selectedYear}`, pageWidth / 2, 20, { align: 'center' });
            pdf.text(String(schoolIdentity.schoolName || '').toUpperCase(), pageWidth / 2, 25, { align: 'center' });
    
            const colorMap: { [key: string]: [number, number, number] } = {
                'bg-red-500': [239, 68, 68],
                'bg-blue-500': [59, 130, 246],
                'bg-green-500': [34, 197, 94],
                'bg-orange-500': [249, 115, 22],
                'bg-yellow-400': [250, 204, 21],
                'bg-gray-400': [156, 163, 175],
                'bg-gray-200': [229, 231, 235],
            };
    
            // Main Table
            const head = [
                [{ content: 'No', rowSpan: 2 }, { content: 'BULAN', rowSpan: 2 }, { content: 'TANGGAL', colSpan: 31 }],
                Array.from({ length: 31 }, (_, i) => `${i + 1}`)
            ];
            
            const body = tableData.map((month: any, index: number) => {
                const row: any[] = [
                    { content: index + 1, styles: { halign: 'center', valign: 'middle' } },
                    { content: `${month.name.toUpperCase()} ${month.year}`, styles: { valign: 'middle' } }
                ];
    
                month.days.forEach((day: any) => {
                    const cellStyles: {
                        halign: 'center';
                        valign: 'middle';
                        textColor: [number, number, number];
                        fillColor?: [number, number, number];
                        fontStyle?: 'bold' | 'normal';
                    } = {
                        halign: 'center',
                        valign: 'middle',
                        textColor: [0, 0, 0], // All text is black
                    };
    
                    const colorKey = Object.keys(colorMap).find(key => day.style.includes(key));
                    if (colorKey) {
                        cellStyles.fillColor = colorMap[colorKey as keyof typeof colorMap];
                        if (day.content && isNaN(parseInt(day.content, 10))) {
                            cellStyles.fontStyle = 'bold';
                        }
                    }
    
                    row.push({
                        content: day.content,
                        styles: cellStyles
                    });
                });
                return row;
            });
    
            (pdf as any).autoTable({
                head: head,
                body: body,
                startY: 30,
                theme: 'grid',
                headStyles: { fontStyle: 'bold', halign: 'center', valign: 'middle', fillColor: [224, 224, 224], textColor: 0, fontSize: 7, cellPadding: 1 },
                styles: { fontSize: 7, cellPadding: 0.5, lineWidth: 0.1, lineColor: 0 },
                columnStyles: {
                    0: { cellWidth: 8 },
                    1: { cellWidth: 35, fontStyle: 'bold' },
                },
            });
    
            let finalY = (pdf as any).lastAutoTable.finalY;
    
            if (finalY + 80 > pageHeight) {
                pdf.addPage();
                finalY = 20;
            }

            let infoBlockStartY = finalY + 8;
            
            // --- Info Section ---
            let infoBlockX = margin.left;
    
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'bold');
            pdf.text('KETERANGAN', infoBlockX, infoBlockStartY);
    
            let legendY = infoBlockStartY + 4;
            let legendX = infoBlockX;
            let legendColumnCount = 0;
            
            legendOrder.forEach(code => {
                const item = legendItems[code as keyof typeof legendItems];
                if (!item) return;
    
                if (legendColumnCount >= 3) {
                    legendX = infoBlockX;
                    legendY += 4;
                    legendColumnCount = 0;
                }
                const colorKey = item.color;
                const color = colorMap[colorKey as keyof typeof colorMap];
    
                if (color) {
                    pdf.setFillColor(color[0], color[1], color[2]);
                    pdf.rect(legendX, legendY - 2.5, 10, 3, 'F');
                }
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(0);
                pdf.text(String(code), legendX + 5, legendY, { align: 'center' });
                
                pdf.setFont('helvetica', 'normal');
                pdf.text(`: ${String(item.label)}`, legendX + 11, legendY);
                legendX += 80;
                legendColumnCount++;
            });
    
            let holidayListY = legendY + 5;
            pdf.setFont('helvetica', 'bold');
            pdf.text('Libur Hari Besar', infoBlockX, holidayListY);
            holidayListY += 3;
    
            pdf.setFont('helvetica', 'normal');
            const midPoint = Math.ceil(holidayList.length / 2);
            for (let i = 0; i < midPoint; i++) {
                pdf.text(`${String(holidayList[i].date)} : ${String(holidayList[i].description)}`, infoBlockX, holidayListY + (i * 3));
                if (holidayList[i + midPoint]) {
                    pdf.text(`${String(holidayList[i + midPoint].date)} : ${String(holidayList[i + midPoint].description)}`, infoBlockX + 120, holidayListY + (i * 3));
                }
            }
            
            let endOfInfoY = holidayListY + (midPoint * 3);
    
            // --- Summary Section ---
            const text1 = `Hari efektif Semester Ganjil : ${effectiveDaysSummary.sem1} hari / ${Math.round(effectiveDaysSummary.sem1 / 6)} pekan`;
            const text2 = `Hari efektif Semester Genap : ${effectiveDaysSummary.sem2} hari / ${Math.round(effectiveDaysSummary.sem2 / 6)} pekan`;

            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'normal');
            const text1Width = pdf.getStringUnitWidth(text1) * pdf.internal.getFontSize() / pdf.internal.scaleFactor;
            const text2Width = pdf.getStringUnitWidth(text2) * pdf.internal.getFontSize() / pdf.internal.scaleFactor;
            const boxWidth = Math.max(text1Width, text2Width) + 6;
            const boxHeight = 14;
    
            const summaryX = pageWidth - margin.right - boxWidth;
            const summaryY = infoBlockStartY + 5;
    
            pdf.setDrawColor(0);
            pdf.rect(summaryX, summaryY, boxWidth, boxHeight);
    
            const textX = summaryX + 3;
            const textY = summaryY + 5;
            pdf.text(text1, textX, textY);
            pdf.text(text2, textX, textY + 5);
            
            // --- Signature Block ---
            if (signatureOption !== 'none') {
                 const signatureBlockStartY = Math.max(endOfInfoY + 8, summaryY + boxHeight + 8);

                pdf.setFontSize(9);
                pdf.setFont('helvetica', 'normal');
                const formattedDate = new Date(signatureDate + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

                if (signatureOption === 'both') {
                    const principalSignatureX = 50;
                    pdf.text('Mengetahui,', principalSignatureX, signatureBlockStartY);
                    pdf.text('Kepala Sekolah', principalSignatureX, signatureBlockStartY + 5);
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(String(schoolIdentity.principalName || ''), principalSignatureX, signatureBlockStartY + 25);
                    const principalNameWidth = pdf.getStringUnitWidth(String(schoolIdentity.principalName || '')) * pdf.internal.getFontSize() / pdf.internal.scaleFactor;
                    pdf.setLineWidth(0.2);
                    pdf.line(principalSignatureX, signatureBlockStartY + 25.5, principalSignatureX + principalNameWidth, signatureBlockStartY + 25.5);
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${String(schoolIdentity.principalNip || '')}`, principalSignatureX, signatureBlockStartY + 30);
                }

                if (signatureOption === 'teacher' || signatureOption === 'both') {
                    const signatureXTeacher = pageWidth - margin.right - 80;
                    pdf.text(`${schoolIdentity.city || '...................'}, ${formattedDate}`, signatureXTeacher, signatureBlockStartY);
                    pdf.text(`Guru ${selectedClass}`, signatureXTeacher, signatureBlockStartY + 5);
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(String(teacher.fullName || ''), signatureXTeacher, signatureBlockStartY + 25);
                    const teacherNameWidth = pdf.getStringUnitWidth(String(teacher.fullName || '')) * pdf.internal.getFontSize() / pdf.internal.scaleFactor;
                    pdf.line(signatureXTeacher, signatureBlockStartY + 25.5, signatureXTeacher + teacherNameWidth, signatureBlockStartY + 25.5);
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${String(teacher.nip || '')}`, signatureXTeacher, signatureBlockStartY + 30);
                }
            }
    
            const fileName = `Kalender-Pendidikan-Tahunan-${selectedYear.replace('/', '-')}.pdf`;
            pdf.save(fileName);
            setNotification({ message: `PDF berhasil dibuat: ${fileName}`, type: 'success' });
    
        } catch (e) {
            console.error(e);
            setNotification({ message: 'Gagal membuat PDF.', type: 'error' });
        } finally {
            setIsGeneratingPDF(false);
        }
    };
    
    const handleDownloadSemesterPDF = async (signatureOption: 'none' | 'teacher' | 'both') => {
        setIsGeneratingPDF(true);
        setNotification({ message: 'Mempersiapkan PDF, mohon tunggu...', type: 'info' });
        await new Promise(resolve => setTimeout(resolve, 50));
    
        if (!schoolIdentity || !teacher) {
            setNotification({ message: 'Gagal mendapatkan data sekolah/guru untuk PDF.', type: 'error' });
            setIsGeneratingPDF(false);
            return;
        }
    
        const drawMonthCalendar = (pdfInstance: any, year: number, month: number, startX: number, startY: number) => {
            const contentWidth = 215 - 20 - 5; // pageWidth - leftMargin - rightMargin
            const calendarGridConfig = { cols: 2, hSpacing: 5 };
            const calendarWidth = (contentWidth - calendarGridConfig.hSpacing) / calendarGridConfig.cols;
            const cellWidth = calendarWidth / 7;
            const cellHeight = 7.5;
            const dateCircleRadius = 3;
            let currentDrawY = startY;
            const monthData = generateMonthData(year, month, events);
            
            // Month Header
            const monthHeaderHeight = 6;
            pdfInstance.setFillColor(243, 244, 246);
            pdfInstance.setDrawColor(0);
            pdfInstance.rect(startX, currentDrawY, calendarWidth, monthHeaderHeight, 'FD');
            pdfInstance.setFont('helvetica', 'bold');
            pdfInstance.setFontSize(10);
            pdfInstance.text(`${monthNames[month]} ${year}`, startX + calendarWidth / 2, currentDrawY + monthHeaderHeight / 2, { align: 'center', baseline: 'middle' });
            currentDrawY += monthHeaderHeight;

            // Day Headers
            const dayHeaderHeight = 5;
            pdfInstance.setFontSize(8);
            for (let i = 0; i < 7; i++) {
                const dayX = startX + i * cellWidth;
                pdfInstance.setFillColor(243, 244, 246);
                pdfInstance.rect(dayX, currentDrawY, cellWidth, dayHeaderHeight, 'FD');
                pdfInstance.setTextColor(i === 0 ? '#DC2626' : '#000000');
                pdfInstance.text(dayNames[i], dayX + cellWidth / 2, currentDrawY + dayHeaderHeight / 2, { align: 'center', baseline: 'middle' });
            }
            pdfInstance.setTextColor('#000000');
            currentDrawY += dayHeaderHeight;
        
            // Date Grid
            monthData.forEach(week => {
                week.forEach((day, dayIndex) => {
                    const cellX = startX + dayIndex * cellWidth;
                    const cellY = currentDrawY;
                    const cellCenterX = cellX + cellWidth / 2;
                    const cellCenterY = cellY + cellHeight / 2;
                    
                    const dayCategories = new Set<string>();
                    if (day.isSunday) dayCategories.add('SUNDAY');
                    day.events.forEach(e => {
                        const cat = getEventCategory(e);
                        if (cat) dayCategories.add(cat);
                    });

                    let highestPriorityCategory = '';
                    const priorityOrder = ['LHB', 'SUNDAY', 'CUTI', 'LIBUR_BIASA', 'PENILAIAN', 'KEGIATAN'];
                    for (const cat of priorityOrder) {
                        if (dayCategories.has(cat)) {
                            highestPriorityCategory = cat;
                            break;
                        }
                    }

                    // Draw background for Sunday
                    if (day.isCurrentMonth && day.isSunday) {
                        pdfInstance.setFillColor(229, 231, 235); // Grey
                        pdfInstance.rect(cellX, cellY, cellWidth, cellHeight, 'F');
                    }
                    
                    // Draw markers
                    if (day.isCurrentMonth) {
                         switch(highestPriorityCategory) {
                            case 'LHB':
                                pdfInstance.setFillColor(239, 68, 68); // Red
                                pdfInstance.circle(cellCenterX, cellCenterY, dateCircleRadius, 'F');
                                break;
                            case 'LIBUR_BIASA':
                                pdfInstance.setFillColor(249, 115, 22); // Orange
                                pdfInstance.circle(cellCenterX, cellCenterY, dateCircleRadius, 'F');
                                break;
                            case 'CUTI':
                                pdfInstance.setFillColor(250, 204, 21); // Yellow
                                pdfInstance.circle(cellCenterX, cellCenterY, dateCircleRadius, 'F');
                                break;
                            case 'PENILAIAN':
                                pdfInstance.setFillColor(59, 130, 246); // Blue
                                pdfInstance.circle(cellCenterX, cellCenterY, dateCircleRadius, 'F');
                                break;
                            case 'KEGIATAN':
                                pdfInstance.setFillColor(74, 222, 128); // Green
                                pdfInstance.circle(cellCenterX, cellCenterY, dateCircleRadius, 'F');
                                break;
                        }
                    }

                    // Draw border for all cells
                    pdfInstance.setDrawColor(0);
                    pdfInstance.rect(cellX, cellY, cellWidth, cellHeight);
                    
                    // Draw date number
                    if (day.isCurrentMonth) {
                        pdfInstance.setFontSize(8);
                        let textColor = '#000000';
                        let fontStyle = 'normal';

                        if (highestPriorityCategory && highestPriorityCategory !== 'SUNDAY') {
                            textColor = '#000000';
                            fontStyle = 'bold';
                        } else if (highestPriorityCategory === 'SUNDAY') {
                            textColor = '#DC2626'; // Red text for Sundays
                        }
                       
                        pdfInstance.setFont('helvetica', fontStyle);
                        pdfInstance.setTextColor(textColor);
                        pdfInstance.text(String(day.date), cellCenterX, cellCenterY, { align: 'center', baseline: 'middle' });

                        // Reset for next cell
                        pdfInstance.setFont('helvetica', 'normal');
                        pdfInstance.setTextColor('#000000');
                    }
                });
                currentDrawY += cellHeight;
            });
        
            // Legend
            const MAX_ROWS_LEGEND = 4;
            let legendBody: { text: string; colorCode: string; }[][];
        
            const monthEvents = events.filter(e => new Date(e.date).getMonth() === month && new Date(e.date).getFullYear() === year);
            // STABILITY FIX: Define explicit type for the accumulator
            type GroupedEvents = Record<string, { dates: number[]; type: string }>;

            const groupedEvents = monthEvents.reduce((acc: GroupedEvents, curr) => {
                if (!acc[curr.description]) {
                    acc[curr.description] = { dates: [], type: getFormTypeFromEvent(curr) };
                }
                acc[curr.description].dates.push(new Date(curr.date).getDate());
                acc[curr.description].dates = [...new Set(acc[curr.description].dates)];
                return acc;
            }, {} as GroupedEvents);
        
            if (Object.keys(groupedEvents).length > 0) {
                // STABILITY FIX: Add explicit type annotations for sort callback parameters
                const sortedGroupedEvents = Object.entries(groupedEvents).sort(
                    // STABILITY FIX: Add explicit types for sort parameters `a` and `b`.
                    ([, a]: [string, { dates: number[], type: string }], [, b]: [string, { dates: number[], type: string }]) => {
                        const minDateA = Math.min(...a.dates);
                        const minDateB = Math.min(...b.dates);
                        return minDateA - minDateB;
                    }
                );
                
                // STABILITY FIX: Add explicit type annotation to map callback parameter
                const legendItems = sortedGroupedEvents.map(([desc, eventData]: [string, { dates: number[], type: string }]) => {
                    const { dates, type } = eventData;
                    let colorCode = '';
                    if (type === 'assessment') colorCode = 'blue';
                    else if (type.startsWith('holiday')) colorCode = 'red';
                    
                    dates.sort((a, b) => a - b);
                    // STABILITY FIX: Add explicit type to accumulator in reduce
                    const ranges = dates.reduce((r: number[][], n) => {
                        const last = r[r.length - 1];
                        if (last && last[last.length - 1] === n - 1) {
                            last.push(n);
                        } else {
                            r.push([n]);
                        }
                        return r;
                    }, [] as number[][]).map(range => range.length > 1 ? `${range[0]}-${range[range.length - 1]}` : `${range[0]}`).join(', ');
                    return { text: `${ranges}: ${desc}`, colorCode: colorCode };
                });
        
                legendBody = [];
                for (let i = 0; i < MAX_ROWS_LEGEND; i++) {
                    const leftItem = legendItems[i] || { text: '', colorCode: '' };
                    const rightItem = legendItems[i + MAX_ROWS_LEGEND] || { text: '', colorCode: '' };
                    legendBody.push([leftItem, rightItem]);
                }
            } else {
                // STABILITY FIX: Ensure the filled array has objects with the correct shape, including `colorCode`.
                legendBody = Array(MAX_ROWS_LEGEND).fill([{text:'', colorCode: ''}, {text:'', colorCode: ''}]);
            }
        
            (pdfInstance as any).autoTable({
                head: [[{ content: 'Keterangan:', colSpan: 2 }]],
                body: legendBody.map((row) => [row[0].text, row[1].text]),
                startY: currentDrawY,
                margin: { left: startX },
                tableWidth: calendarWidth,
                theme: 'plain',
                styles: { fontSize: 6, cellPadding: 0.5, halign: 'left' },
                columnStyles: {
                    0: { cellWidth: calendarWidth / 2 },
                    1: { cellWidth: calendarWidth / 2 }
                },
                headStyles: { fontStyle: 'bold', halign: 'left', textColor: [0,0,0] },
                tableLineWidth: 0.1,
                tableLineColor: [0, 0, 0],
                // STABILITY FIX: Add explicit type for `data` object in hook
                didParseCell: function(data: jsPDFAutoTableCell) {
                    const leftItem = legendBody[data.row.index]?.[0];
                    const rightItem = legendBody[data.row.index]?.[1];

                    if (data.column.index === 0 && leftItem?.colorCode) {
                        if (leftItem.colorCode === 'blue') data.cell.styles.textColor = [59, 130, 246];
                        if (leftItem.colorCode === 'red') data.cell.styles.textColor = [220, 38, 38];
                    }
                     if (data.column.index === 1 && rightItem?.colorCode) {
                        if (rightItem.colorCode === 'blue') data.cell.styles.textColor = [59, 130, 246];
                        if (rightItem.colorCode === 'red') data.cell.styles.textColor = [220, 38, 38];
                    }
                }
            });
        };

        try {
            const { jsPDF } = jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [215, 330] });
    
            const margin = { top: 10, right: 5, bottom: 5, left: 20 };
            const pageWidth = 215;
            const pageHeight = 330;
            const contentWidth = pageWidth - margin.left - margin.right;
    
            let currentY = margin.top;

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.text('KALENDER PENDIDIKAN', pageWidth / 2, currentY, { align: 'center' });
            currentY += 7;
            pdf.setFontSize(12);
            pdf.text(String(schoolIdentity.schoolName || '').toUpperCase(), pageWidth / 2, currentY, { align: 'center' });
            currentY += 6;
            const semesterTitle = activeTab === 'semester1' ? `SEMESTER I TAHUN AJARAN ${selectedYear}` : `SEMESTER II TAHUN AJARAN ${selectedYear}`;
            pdf.text(semesterTitle, pageWidth / 2, currentY, { align: 'center' });
            currentY += 10;
    
            const calendarGridConfig = { cols: 2, hSpacing: 5 };
            const calendarWidth = (contentWidth - calendarGridConfig.hSpacing) / calendarGridConfig.cols;
            const maxCalendarBlockHeight = 80;
            let currentX = margin.left;
    
            for(let i = 0; i < monthsToDisplay.length; i++) {
                const monthInfo = monthsToDisplay[i];

                if (currentY + maxCalendarBlockHeight > pageHeight - margin.bottom) {
                    pdf.addPage();
                    currentY = margin.top;
                    currentX = margin.left;
                }

                drawMonthCalendar(pdf, monthInfo.year, monthInfo.month, currentX, currentY);

                if ((i + 1) % 2 === 0) {
                    currentX = margin.left;
                    currentY += maxCalendarBlockHeight;
                } else {
                    currentX += calendarWidth + calendarGridConfig.hSpacing;
                }
            }
            
            if (signatureOption !== 'none') {
                const signatureBlockHeight = 40;
                let finalY;
        
                if (currentY + signatureBlockHeight > pageHeight - margin.bottom) {
                    pdf.addPage();
                    finalY = pageHeight / 2; // Place in the middle of the new page
                } else {
                    // Place it 10mm below the content, but not lower than a fixed bottom-aligned position
                    finalY = Math.max(currentY + 10, pageHeight - margin.bottom - signatureBlockHeight);
                }
               
                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'normal');
                const formattedDate = new Date(signatureDate + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
                
                if (signatureOption === 'both') {
                    const principalSignatureX = 35; // 3.5 cm from left edge
                    pdf.text('Mengetahui,', principalSignatureX, finalY);
                    pdf.text('Kepala Sekolah', principalSignatureX, finalY + 5);
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(String(schoolIdentity.principalName || ''), principalSignatureX, finalY + 25);
                    const principalNameWidth = pdf.getStringUnitWidth(String(schoolIdentity.principalName || '')) * pdf.internal.getFontSize() / pdf.internal.scaleFactor;
                    pdf.setLineWidth(0.2);
                    pdf.line(principalSignatureX, finalY + 25.5, principalSignatureX + principalNameWidth, finalY + 25.5);
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${String(schoolIdentity.principalNip || '')}`, principalSignatureX, finalY + 30);
                }

                if (signatureOption === 'teacher' || signatureOption === 'both') {
                    const signatureXTeacher = pageWidth - margin.right - 80;
                    pdf.text(`${schoolIdentity.city || '...................'}, ${formattedDate}`, signatureXTeacher, finalY);
                    pdf.text(`Guru ${selectedClass}`, signatureXTeacher, finalY + 5);
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(String(teacher.fullName || ''), signatureXTeacher, finalY + 25);
                    const teacherNameWidth = pdf.getStringUnitWidth(String(teacher.fullName || '')) * pdf.internal.getFontSize() / pdf.internal.scaleFactor;
                    pdf.line(signatureXTeacher, finalY + 25.5, signatureXTeacher + teacherNameWidth, finalY + 25.5);
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${String(teacher.nip || '')}`, signatureXTeacher, finalY + 30);
                }
            }
    
            const fileName = `Kalender-Pendidikan-Semester-${activeTab === 'semester1' ? 'I' : 'II'}-${selectedYear.replace('/', '-')}.pdf`;
            pdf.save(fileName);
            setNotification({ message: `PDF berhasil dibuat: ${fileName}`, type: 'success' });
    
        } catch (error) {
            console.error(error);
            setNotification({ message: 'Terjadi kesalahan saat membuat PDF.', type: 'error' });
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    const handleDownloadPDF = (signatureOption: 'none' | 'teacher' | 'both') => {
        setIsPdfDropdownOpen(false);
        if (activeTab === 'all') {
            handleDownloadYearlyPDF(signatureOption);
        } else {
            handleDownloadSemesterPDF(signatureOption);
        }
    }


    const renderTitle = () => {
        if (isLoading) return <div className="text-center p-4">Memuat...</div>;
        return (
            <div className="text-center mb-6">
                <h1 className="text-xl font-bold">KALENDER PENDIDIKAN</h1>
                <h2 className="text-lg font-semibold">{schoolIdentity?.schoolName.toUpperCase() || 'NAMA SEKOLAH'}</h2>
                <h3 className="text-lg">
                    {activeTab === 'semester1' && `SEMESTER I TAHUN AJARAN ${selectedYear}`}
                    {activeTab === 'semester2' && `SEMESTER II TAHUN AJARAN ${selectedYear}`}
                </h3>
            </div>
        );
    };
    
    return (
        <>
        <div className="bg-white p-8 rounded-xl shadow-lg">
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-4 border-b border-gray-200 gap-4">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <button onClick={() => setActiveTab('semester1')} className={`${activeTab === 'semester1' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>Semester I</button>
                    <button onClick={() => setActiveTab('semester2')} className={`${activeTab === 'semester2' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>Semester II</button>
                    <button onClick={() => setActiveTab('all')} className={`${activeTab === 'all' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>Semua Semester</button>
                </nav>
                 <div className="flex flex-wrap items-center gap-2 mb-2 lg:mb-0">
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
                    <label htmlFor="signatureDate" className="text-sm font-medium text-gray-700 shrink-0">Tgl Cetak:</label>
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
                            disabled={isLoading || isSubmitting || isGeneratingPDF}
                            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-semibold shadow flex items-center space-x-2 disabled:bg-gray-400"
                        >
                            <ArrowDownTrayIcon className="w-5 h-5"/> <span>{isGeneratingPDF ? 'Memproses...' : 'Download PDF'}</span>
                        </button>
                        {isPdfDropdownOpen && (
                            <div 
                                className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-50 border"
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
                </div>
            </div>
            
             {isLoading ? (
                <div className="text-center p-8">Memuat kalender...</div>
            ) : activeTab === 'all' ? (
                <div id="yearly-view-data-provider">
                    <YearlyCalendarView events={events} selectedYear={selectedYear} schoolIdentity={schoolIdentity} />
                </div>
            ) : (
                <>
                    {renderTitle()}
                    <div className="flex flex-wrap -mx-2">
                        {monthsToDisplay.map((item) => (
                             <MonthCalendar key={`${item.year}-${item.month}`} year={item.year} month={item.month} events={events} onDateClick={handleDateClick} />
                        ))}
                    </div>
                </>
            )}


            {isModalOpen && selectedDay && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]" onClick={closeModal}>
                    <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">
                                Edit Tanggal: {new Date(selectedDay.fullDate + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </h3>
                            <button onClick={closeModal} className="text-gray-400 hover:text-gray-600"><XMarkIcon className="w-6 h-6"/></button>
                        </div>
                        <form onSubmit={handleSaveEvent}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Keterangan Kegiatan</label>
                                    <input type="text" name="description" value={eventFormData.description} onChange={handleEventFormChange} required placeholder="Contoh: MPLS" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"/>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Jenis</label>
                                        <select name="type" value={eventFormData.type} onChange={handleEventFormChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                                            <option value="event">Kegiatan Sekolah</option>
                                            <option value="assessment">Penilaian</option>
                                            <option value="holiday-lhb">Libur Hari Besar</option>
                                            <option value="holiday-biasa">Libur Biasa</option>
                                            <option value="holiday-cuti">Cuti Bersama</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Sampai Tanggal (Opsional)</label>
                                        <input type="date" name="endDate" value={eventFormData.endDate} onChange={handleEventFormChange} min={eventStartDate} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"/>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-6 flex justify-between items-center">
                                {originalEventDescription ? (
                                    <button type="button" onClick={handleDeleteEvent} disabled={isSubmitting} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium disabled:bg-red-400">
                                        {isSubmitting ? 'Menyapus...' : `Hapus "${originalEventDescription}"`}
                                    </button>
                                ) : <div />}
                                <div className="flex space-x-3">
                                    <button type="button" onClick={closeModal} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-medium">Batal</button>
                                    <button type="submit" disabled={isSubmitting || !eventFormData.description} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium disabled:bg-indigo-400">
                                        {isSubmitting ? 'Menyimpan...' : 'Simpan'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Konfirmasi Tarik Data Induk */}
            {isPullModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black bg-opacity-60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all animate-fade-in scale-100">
                        <div className="p-6">
                            <div className="flex items-center justify-center w-16 h-16 mx-auto bg-purple-100 rounded-full mb-4">
                                <SparklesIcon className="w-10 h-10 text-purple-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Tarik Data Induk?</h3>
                            <p className="text-gray-600 text-center text-sm mb-6">
                                Anda akan menyalin data kalender pendidikan dari Admin. 
                                <br/><br/>
                                <span className="text-red-600 font-bold">Peringatan:</span> Kalender yang Anda buat sendiri di tahun ajaran ini akan <span className="underline">ditimpa sepenuhnya</span>.
                            </p>
                            <div className="flex flex-col gap-2">
                                <button 
                                    onClick={executePullFromMaster}
                                    disabled={isPulling}
                                    className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors shadow-lg flex items-center justify-center gap-2"
                                >
                                    {isPulling ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : null}
                                    {isPulling ? 'SEDANG MENYALIN...' : 'YA, TARIK DATA SEKARANG'}
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
        </>
    );
};

export default AcademicCalendar;