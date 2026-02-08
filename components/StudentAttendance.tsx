
import React, { useState, useEffect, useMemo } from 'react';
import { Student, SchoolIdentity, Teacher, AcademicEvent } from '../types';
import { getStudents, getSchoolIdentity, getTeacherProfile, getCalendarEvents } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { ArrowDownTrayIcon } from './Icons';

declare const jspdf: any;

interface StudentAttendanceProps {
    selectedClass: string;
    selectedYear: string;
    userId?: string;
}

const MONTHS = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const StudentAttendance: React.FC<StudentAttendanceProps> = ({ selectedClass, selectedYear, userId }) => {
    const [students, setStudents] = useState<Student[]>([]);
    const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity | null>(null);
    const [teacher, setTeacher] = useState<Teacher | null>(null);
    const [events, setEvents] = useState<AcademicEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);

    // Initial state for month/year based on current date, but constrained by academic year
    const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
    const [selectedYearForMonth, setSelectedYearForMonth] = useState<number>(new Date().getFullYear());

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                // SINKRONISASI: Mengambil data dari database guru jika userId tersedia
                const [studentsData, identity, teacherData, calendarEvents] = await Promise.all([
                    getStudents(selectedYear, selectedClass, userId),
                    getSchoolIdentity(userId),
                    getTeacherProfile(selectedYear, selectedClass, userId),
                    getCalendarEvents(selectedYear, userId)
                ]);
                // Filter students who have a name
                setStudents(studentsData.filter(s => s.fullName));
                setSchoolIdentity(identity);
                setTeacher(teacherData);
                setEvents(calendarEvents);
                
                // Initialize dropdowns to logical defaults based on selected academic year
                const [startYear, endYear] = selectedYear.split('/').map(Number);
                const now = new Date();
                const currentMonth = now.getMonth();
                const currentYear = now.getFullYear();

                // If current date is within academic year, use it. Otherwise default to July of start year.
                if ((currentYear === startYear && currentMonth >= 6) || (currentYear === endYear && currentMonth <= 5)) {
                    setSelectedMonth(currentMonth);
                    setSelectedYearForMonth(currentYear);
                } else {
                    setSelectedMonth(6); // July
                    setSelectedYearForMonth(startYear);
                }

            } catch (error: any) {
                setNotification({ message: 'Gagal memuat data: ' + error.message, type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [selectedClass, selectedYear, userId]);

    // Generate Month Options based on Academic Year
    const monthOptions = useMemo(() => {
        const [startYear, endYear] = selectedYear.split('/').map(Number);
        const options = [];

        // Semester 1: July - Dec (Start Year)
        for (let i = 6; i < 12; i++) {
            options.push({ monthIndex: i, year: startYear, label: `${MONTHS[i]} ${startYear}` });
        }
        // Semester 2: Jan - June (End Year)
        for (let i = 0; i < 6; i++) {
            options.push({ monthIndex: i, year: endYear, label: `${MONTHS[i]} ${endYear}` });
        }
        return options;
    }, [selectedYear]);

    const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const index = parseInt(e.target.value, 10);
        const selected = monthOptions[index];
        if (selected) {
            setSelectedMonth(selected.monthIndex);
            setSelectedYearForMonth(selected.year);
        }
    };

    const daysInMonth = useMemo(() => {
        return new Date(selectedYearForMonth, selectedMonth + 1, 0).getDate();
    }, [selectedMonth, selectedYearForMonth]);

    const getDateStatus = (day: number) => {
        const dateObj = new Date(selectedYearForMonth, selectedMonth, day);
        const dateStr = `${selectedYearForMonth}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        const isSunday = dateObj.getDay() === 0;
        const holidayEvent = events.find(e => e.date === dateStr && e.type === 'holiday');
        
        return { isSunday, isHoliday: !!holidayEvent, holidayDesc: holidayEvent?.description || '' };
    };

    // Logic to find the last effective working day of the month
    const getLastEffectiveDate = () => {
        // Start from the last day of the month
        for (let day = daysInMonth; day >= 1; day--) {
            const { isSunday, isHoliday } = getDateStatus(day);
            if (!isSunday && !isHoliday) {
                return new Date(selectedYearForMonth, selectedMonth, day);
            }
        }
        // Fallback to last day if something goes wrong (e.g. whole month is holiday)
        return new Date(selectedYearForMonth, selectedMonth, daysInMonth);
    };

    const handleDownloadPDF = async () => {
        if (!schoolIdentity || !teacher) {
            setNotification({ message: 'Data sekolah atau guru belum lengkap.', type: 'error' });
            return;
        }

        setIsGeneratingPDF(true);
        setNotification({ message: 'Mempersiapkan PDF...', type: 'info' });
        await new Promise(r => setTimeout(r, 100));

        try {
            const { jsPDF } = jspdf;
            // Landscape F4 (330mm width)
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [330, 215] });
            
            // Margin Atas 20mm (2cm) untuk space jilid/bendel
            const margin = { top: 20, left: 10, right: 10, bottom: 15 };
            const pageWidth = 330;
            let y = margin.top;

            // HEADER
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.text(`DAFTAR HADIR SISWA KELAS ${selectedClass.replace('Kelas ', '')} ${schoolIdentity.schoolName.toUpperCase()}`, pageWidth / 2, y, { align: 'center' });
            y += 7;
            pdf.setFontSize(11);
            pdf.text(`BULAN: ${MONTHS[selectedMonth].toUpperCase()} ${selectedYearForMonth}   Tahun Ajaran: ${selectedYear}`, pageWidth / 2, y, { align: 'center' });
            y += 10; // Empty line below header

            // TABLE HEADERS
            const daysHeader = [];
            for (let i = 1; i <= daysInMonth; i++) {
                daysHeader.push({ content: i.toString(), styles: { halign: 'center', cellWidth: 'auto' } });
            }

            const head = [
                [
                    { content: 'No', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                    { content: 'Nama Siswa', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                    { content: 'Tanggal', colSpan: daysInMonth, styles: { halign: 'center' } },
                    { content: 'Jumlah', colSpan: 3, styles: { halign: 'center' } },
                ],
                [
                    ...daysHeader,
                    { content: 'S', styles: { halign: 'center' } },
                    { content: 'I', styles: { halign: 'center' } },
                    { content: 'A', styles: { halign: 'center' } },
                ]
            ];

            // TABLE BODY
            const body = [];
            let counter = 1;

            // 1. Existing Students
            const sortedStudents = [...students].sort((a, b) => a.fullName.localeCompare(b.fullName));
            
            sortedStudents.forEach((student) => {
                const row = [
                    counter.toString(),
                    student.fullName,
                ];
                // Empty date cells
                for (let i = 0; i < daysInMonth; i++) row.push('');
                // Empty summary cells
                row.push('', '', ''); 
                body.push(row);
                counter++;
            });

            // 2. Extra 3 Empty Rows (Requested) - No Number
            for (let i = 0; i < 3; i++) {
                const row = [
                    '', // Empty Number
                    '', // Empty Name
                ];
                // Empty date cells
                for (let j = 0; j < daysInMonth; j++) row.push('');
                // Empty summary cells
                row.push('', '', '');
                body.push(row);
                // counter is NOT incremented
            }

            // AUTO TABLE
            (pdf as any).autoTable({
                head: head,
                body: body,
                startY: y,
                theme: 'grid',
                styles: {
                    fontSize: 8,
                    cellPadding: 1,
                    lineColor: 0,
                    lineWidth: 0.1,
                    textColor: 0
                },
                headStyles: {
                    fillColor: [230, 230, 230],
                    textColor: 0,
                    fontStyle: 'bold',
                },
                columnStyles: {
                    0: { cellWidth: 10, halign: 'center' }, // No
                    1: { cellWidth: 60 }, // Nama - Fixed width
                    // Date columns auto-sized by plugin, but we can constrain if needed
                },
                margin: { left: margin.left, right: margin.right },
                didParseCell: (data: any) => {
                    // Identify Date Columns (index 2 to 2 + daysInMonth - 1)
                    if (data.column.index >= 2 && data.column.index < 2 + daysInMonth) {
                        const day = data.column.index - 1; // 1-based day
                        const { isSunday, isHoliday } = getDateStatus(day);

                        // HEADERS
                        if (data.section === 'head' && data.row.index === 1) {
                            if (isSunday) {
                                data.cell.styles.fillColor = [220, 38, 38]; // Red
                                data.cell.styles.textColor = [255, 255, 255];
                            } else if (isHoliday) {
                                data.cell.styles.fillColor = [249, 115, 22]; // Orange
                                data.cell.styles.textColor = [255, 255, 255];
                            }
                        }
                        
                        // BODY CELLS
                        if (data.section === 'body') {
                            if (isSunday) {
                                data.cell.styles.fillColor = [254, 202, 202]; // Light Red
                            } else if (isHoliday) {
                                data.cell.styles.fillColor = [254, 215, 170]; // Light Orange
                            }
                        }
                    }
                }
            });

            y = (pdf as any).lastAutoTable.finalY + 10;

            // SUMMARY
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'normal');
            pdf.text('Persentase Kehadiran: ........................... %', margin.left, y);
            y += 10;

            // SIGNATURES
            const teacherX = pageWidth - margin.right - 60;
            const principalX = margin.left + 20;
            
            // Calculate Effective Date for Signature
            const effectiveDate = getLastEffectiveDate();
            const dateStr = `${schoolIdentity.city || '.......'}, ${effectiveDate.getDate()} ${MONTHS[selectedMonth]} ${selectedYearForMonth}`;

            // Check page break for signatures
            if (y + 40 > 215) {
                pdf.addPage();
                y = margin.top;
            }

            pdf.text('Mengetahui,', principalX, y);
            pdf.text(`${dateStr}`, teacherX, y);
            y += 5;
            pdf.text('Kepala Sekolah', principalX, y);
            pdf.text(`Guru Kelas ${selectedClass.replace('Kelas ', '')}`, teacherX, y);
            y += 25;

            pdf.setFont('helvetica', 'bold');
            pdf.text(schoolIdentity.principalName, principalX, y);
            pdf.text(teacher.fullName, teacherX, y);
            y += 5;
            
            pdf.setFont('helvetica', 'normal');
            pdf.text(`NIP. ${schoolIdentity.principalNip}`, principalX, y);
            pdf.text(`NIP. ${teacher.nip}`, teacherX, y);

            pdf.save(`Daftar-Hadir-${MONTHS[selectedMonth]}-${selectedYearForMonth}.pdf`);
            setNotification({ message: 'PDF berhasil dibuat.', type: 'success' });

        } catch (error: any) {
            console.error(error);
            setNotification({ message: 'Gagal membuat PDF: ' + error.message, type: 'error' });
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    if (isLoading) return <div className="text-center p-8">Memuat data...</div>;

    const sortedStudents = [...students].sort((a, b) => a.fullName.localeCompare(b.fullName));
    const effectiveDate = getLastEffectiveDate();

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg">
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}

            {/* Controls */}
            <div className="flex justify-between items-center mb-6 pb-6 border-b">
                <div className="flex items-center space-x-4">
                    <label className="text-sm font-medium text-gray-700">Pilih Bulan:</label>
                    <select 
                        className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                        onChange={handleMonthChange}
                        value={monthOptions.findIndex(o => o.monthIndex === selectedMonth && o.year === selectedYearForMonth)}
                    >
                        {monthOptions.map((opt, idx) => (
                            <option key={idx} value={idx}>{opt.label}</option>
                        ))}
                    </select>
                </div>
                <button 
                    onClick={handleDownloadPDF} 
                    disabled={isGeneratingPDF}
                    className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 shadow"
                >
                    {isGeneratingPDF ? (
                        <span>Memproses...</span>
                    ) : (
                        <>
                            <ArrowDownTrayIcon className="w-5 h-5"/>
                            <span>Download PDF</span>
                        </>
                    )}
                </button>
            </div>

            {/* Preview (Screen Only) */}
            <div className="border border-gray-200 p-8 shadow-sm bg-gray-50 overflow-x-auto">
                <div className="min-w-[1000px] bg-white p-8 shadow">
                    <div className="text-center mb-6">
                        <h2 className="text-xl font-bold uppercase">DAFTAR HADIR SISWA KELAS {selectedClass.replace('Kelas ', '')} {schoolIdentity?.schoolName}</h2>
                        <h3 className="text-lg font-semibold mt-1">
                            BULAN: {MONTHS[selectedMonth].toUpperCase()} {selectedYearForMonth} &nbsp;&nbsp; Tahun Ajaran: {selectedYear}
                        </h3>
                    </div>

                    <div className="mb-4"></div> {/* Empty Line */}

                    <table className="w-full border-collapse border border-black text-xs">
                        <thead>
                            <tr>
                                <th rowSpan={2} className="border border-black p-1 text-center bg-gray-100 w-8">No</th>
                                <th rowSpan={2} className="border border-black p-1 text-center bg-gray-100 min-w-[200px]">Nama Siswa</th>
                                <th colSpan={daysInMonth} className="border border-black p-1 text-center bg-gray-100">Tanggal</th>
                                <th colSpan={3} className="border border-black p-1 text-center bg-gray-100 w-24">Jumlah</th>
                            </tr>
                            <tr>
                                {Array.from({ length: daysInMonth }, (_, i) => {
                                    const { isSunday, isHoliday } = getDateStatus(i + 1);
                                    let headerClass = "border border-black p-1 text-center w-6";
                                    if (isSunday) {
                                        headerClass += " bg-red-600 text-white";
                                    } else if (isHoliday) {
                                        headerClass += " bg-orange-500 text-white";
                                    }
                                    return (
                                        <th key={i} className={headerClass}>
                                            {i + 1}
                                        </th>
                                    );
                                })}
                                <th className="border border-black p-1 text-center bg-gray-100 w-8">S</th>
                                <th className="border border-black p-1 text-center bg-gray-100 w-8">I</th>
                                <th className="border border-black p-1 text-center bg-gray-100 w-8">A</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Render Students */}
                            {sortedStudents.map((student, idx) => (
                                <tr key={student.id}>
                                    <td className="border border-black p-1 text-center">{idx + 1}</td>
                                    <td className="border border-black p-1 px-2">{student.fullName}</td>
                                    {Array.from({ length: daysInMonth }, (_, i) => {
                                        const { isSunday, isHoliday, holidayDesc } = getDateStatus(i + 1);
                                        let cellClass = "border border-black p-1 text-center p-0 align-middle";

                                        if (isSunday) {
                                            cellClass += " bg-red-200";
                                        } else if (isHoliday) {
                                            cellClass += " bg-orange-200";
                                        }

                                        return (
                                            <td key={i} className={cellClass} title={isHoliday ? holidayDesc : ''}>
                                            </td>
                                        );
                                    })}
                                    <td className="border border-black p-1"></td>
                                    <td className="border border-black p-1"></td>
                                    <td className="border border-black p-1"></td>
                                </tr>
                            ))}
                            {/* Render 3 Empty Rows */}
                            {Array.from({ length: 3 }, (_, idx) => (
                                <tr key={`extra-${idx}`}>
                                    <td className="border border-black p-1 text-center"></td> {/* Empty Number */}
                                    <td className="border border-black p-1 px-2"></td>
                                    {Array.from({ length: daysInMonth }, (_, i) => {
                                        const { isSunday, isHoliday } = getDateStatus(i + 1);
                                        let cellClass = "border border-black p-1 text-center p-0 align-middle";
                                        if (isSunday) cellClass += " bg-red-200";
                                        else if (isHoliday) cellClass += " bg-orange-200";
                                        return <td key={i} className={cellClass}></td>;
                                    })}
                                    <td className="border border-black p-1"></td>
                                    <td className="border border-black p-1"></td>
                                    <td className="border border-black p-1"></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="mt-4">
                        <p>Persentase Kehadiran: ........................... %</p>
                    </div>

                    <div className="flex justify-between mt-10 px-10">
                        <div className="text-center">
                            <p>Mengetahui,</p>
                            <p>Kepala Sekolah</p>
                            <div className="h-20"></div>
                            <p className="font-bold underline">{schoolIdentity?.principalName}</p>
                            <p>NIP. {schoolIdentity?.principalNip}</p>
                        </div>
                        <div className="text-center">
                            <p>{schoolIdentity?.city || '.......'}, {effectiveDate.getDate()} {MONTHS[selectedMonth]} {selectedYearForMonth}</p>
                            <p>Guru Kelas {selectedClass.replace('Kelas ', '')}</p>
                            <div className="h-20"></div>
                            <p className="font-bold underline">{teacher?.fullName}</p>
                            <p>NIP. {teacher?.nip}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudentAttendance;
