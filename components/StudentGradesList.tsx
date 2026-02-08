
import React, { useState, useEffect } from 'react';
import { Student, SchoolIdentity, Teacher } from '../types';
import { getStudents, getSchoolIdentity, getTeacherProfile } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { ArrowDownTrayIcon } from './Icons';

declare const jspdf: any;

interface StudentGradesListProps {
    selectedClass: string;
    selectedYear: string;
    userId?: string;
}

const StudentGradesList: React.FC<StudentGradesListProps> = ({ selectedClass, selectedYear, userId }) => {
    const [semester, setSemester] = useState<'Ganjil' | 'Genap'>('Ganjil');
    const [students, setStudents] = useState<Student[]>([]);
    const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity | null>(null);
    const [teacher, setTeacher] = useState<Teacher | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [signatureDate, setSignatureDate] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                // SINKRONISASI: Mengambil data dari database guru jika userId tersedia
                const [studentsData, identity, teacherData] = await Promise.all([
                    getStudents(selectedYear, selectedClass, userId),
                    getSchoolIdentity(userId),
                    getTeacherProfile(selectedYear, selectedClass, userId)
                ]);
                // Filter siswa yang memiliki nama
                setStudents(studentsData.filter(s => s.fullName));
                setSchoolIdentity(identity);
                setTeacher(teacherData);
            } catch (error: any) {
                setNotification({ message: 'Gagal memuat data: ' + error.message, type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [selectedClass, selectedYear, userId]);

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
            // Updated to Portrait F4
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [215, 330] });

            // Updated Margins: Left 2cm (20mm), others 1cm (10mm)
            const margin = { top: 10, left: 20, right: 10, bottom: 10 };
            const pageWidth = pdf.internal.pageSize.getWidth();
            let y = margin.top;

            // --- HEADER ---
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            pdf.text(`DAFTAR NILAI SISWA KELAS ${selectedClass.toUpperCase().replace('KELAS ', '')} SEMESTER ${semester.toUpperCase()}`, pageWidth / 2, y, { align: 'center' });
            y += 6;
            pdf.text(`TAHUN AJARAN ${selectedYear}`, pageWidth / 2, y, { align: 'center' });
            y += 6;
            pdf.text(schoolIdentity.schoolName.toUpperCase(), pageWidth / 2, y, { align: 'center' });
            y += 10;

            pdf.setFontSize(11);
            pdf.setFont('helvetica', 'bold');
            pdf.text("MATA PELAJARAN: .................................................................", margin.left, y);
            y += 5;

            // --- TABLE ---
            const head = [
                [
                    { content: 'No', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                    { content: 'Nama Siswa', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                    { content: 'Sumatif Lingkup Materi', colSpan: 6, styles: { halign: 'center' } },
                    { content: 'Rata\nRata', rowSpan: 2, styles: { valign: 'middle', halign: 'center', fontSize: 7 } },
                    { content: 'SAS', colSpan: 2, styles: { halign: 'center' } }, 
                    { content: 'Rata\nRata', rowSpan: 2, styles: { valign: 'middle', halign: 'center', fontSize: 7 } },
                    { content: 'Nilai\nRapor', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                    { content: 'Deskripsi', colSpan: 2, styles: { halign: 'center' } }
                ],
                [
                    { content: 'TP 1', styles: { halign: 'center' } },
                    { content: 'TP 2', styles: { halign: 'center' } },
                    { content: 'TP 3', styles: { halign: 'center' } },
                    { content: 'TP 4', styles: { halign: 'center' } },
                    { content: 'TP 5', styles: { halign: 'center' } },
                    { content: 'TP 6', styles: { halign: 'center' } },
                    { content: '', styles: { halign: 'center' } }, 
                    { content: '', styles: { halign: 'center' } }, 
                    { content: 'TP Tertinggi', styles: { halign: 'center' } },
                    { content: 'TP Terendah', styles: { halign: 'center' } },
                ]
            ];

            const sortedStudents = [...students].sort((a, b) => a.fullName.localeCompare(b.fullName));

            const body = sortedStudents.map((s, i) => [
                i + 1,
                s.fullName,
                '', '', '', '', '', '', 
                '', 
                '', '', 
                '', 
                '', 
                '', '' 
            ]);

            const targetRowCount = 28;
            if (body.length < targetRowCount) {
                const extraRows = targetRowCount - body.length;
                for (let i = 0; i < extraRows; i++) {
                    body.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
                }
            }

            (pdf as any).autoTable({
                head: head,
                body: body,
                startY: y,
                theme: 'grid',
                headStyles: {
                    fillColor: [255, 255, 255],
                    textColor: [0, 0, 0],
                    fontStyle: 'bold',
                    lineWidth: 0.1,
                    lineColor: 0
                },
                styles: {
                    fontSize: 8, 
                    lineColor: 0,
                    lineWidth: 0.1,
                    cellPadding: 1,
                    valign: 'middle',
                    textColor: 0,
                    minCellHeight: 7
                },
                columnStyles: {
                    0: { cellWidth: 8, halign: 'center' }, 
                    1: { cellWidth: 45 }, 
                    2: { cellWidth: 7 }, 
                    3: { cellWidth: 7 },
                    4: { cellWidth: 7 },
                    5: { cellWidth: 7 },
                    6: { cellWidth: 7 },
                    7: { cellWidth: 7 },
                    8: { cellWidth: 8 }, 
                    9: { cellWidth: 7 }, 
                    10: { cellWidth: 7 }, 
                    11: { cellWidth: 8 }, 
                    12: { cellWidth: 14 }, 
                    13: { cellWidth: 22 }, 
                    14: { cellWidth: 22 }, 
                },
                margin: { left: margin.left, right: margin.right }
            });

            y = (pdf as any).lastAutoTable.finalY + 10;

            const pageHeight = pdf.internal.pageSize.getHeight();
            if (y + 40 > pageHeight) {
                pdf.addPage();
                y = margin.top;
            }

            const formattedDate = new Date(signatureDate + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
            const teacherX = pageWidth - margin.right - 50; 
            const principalX = margin.left + 20;

            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'normal');

            pdf.text('Mengetahui,', principalX, y);
            pdf.text(`${schoolIdentity.city || '.......'}, ${formattedDate}`, teacherX, y);
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

            pdf.save(`Daftar-Nilai-${selectedClass.replace(' ', '_')}-${semester}.pdf`);
            setNotification({ message: 'PDF berhasil dibuat.', type: 'success' });

        } catch (error: any) {
            console.error(error);
            setNotification({ message: 'Gagal membuat PDF: ' + error.message, type: 'error' });
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    if (isLoading) return <div className="text-center p-8">Memuat data...</div>;

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg">
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}

            <div className="flex flex-col md:flex-row justify-between items-center mb-6 border-b pb-4 gap-4">
                <div className="flex items-center gap-4">
                    <label className="font-bold text-gray-700">Semester:</label>
                    <select
                        value={semester}
                        onChange={(e) => setSemester(e.target.value as 'Ganjil' | 'Genap')}
                        className="p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                    >
                        <option value="Ganjil">Ganjil</option>
                        <option value="Genap">Genap</option>
                    </select>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-600">Tanggal Cetak:</label>
                        <input
                            type="date"
                            value={signatureDate}
                            onChange={(e) => setSignatureDate(e.target.value)}
                            className="p-2 border border-gray-300 rounded-md text-sm"
                        />
                    </div>
                    <button
                        onClick={handleDownloadPDF}
                        disabled={isGeneratingPDF}
                        className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold shadow disabled:bg-indigo-400"
                    >
                        <ArrowDownTrayIcon className="w-5 h-5 mr-2" />
                        {isGeneratingPDF ? 'Memproses...' : 'Download PDF'}
                    </button>
                </div>
            </div>

            <div className="bg-gray-50 border p-6 rounded-lg overflow-x-auto">
                <div className="min-w-[1000px] bg-white p-8 shadow border border-gray-200">
                    <div className="text-center mb-6">
                        <h2 className="text-xl font-bold uppercase">DAFTAR NILAI SISELA KELAS {selectedClass.replace('Kelas ', '')} SEMESTER {semester.toUpperCase()}</h2>
                        <h3 className="text-lg font-bold uppercase">TAHUN AJARAN {selectedYear}</h3>
                        <h4 className="text-lg font-bold uppercase mt-2">{schoolIdentity?.schoolName}</h4>
                    </div>
                    
                    <div className="mb-4 font-bold text-lg border-b border-black pb-1 inline-block min-w-[50%]">
                        MATA PELAJARAN: .................................................................
                    </div>

                    <table className="w-full border-collapse border border-black text-xs text-center">
                        <thead>
                            <tr className="bg-gray-100">
                                <th rowSpan={2} className="border border-black p-2">No</th>
                                <th rowSpan={2} className="border border-black p-2 min-w-[150px]">Nama Siswa</th>
                                <th colSpan={6} className="border border-black p-2">Sumatif Lingkup Materi</th>
                                <th rowSpan={2} className="border border-black p-2">Rata<br/>Rata</th>
                                <th colSpan={2} className="border border-black p-2">SAS</th>
                                <th rowSpan={2} className="border border-black p-2">Rata<br/>Rata</th>
                                <th rowSpan={2} className="border border-black p-2">Nilai<br/>Rapor</th>
                                <th colSpan={2} className="border border-black p-2">Deskripsi</th>
                            </tr>
                            <tr className="bg-gray-100">
                                <th className="border border-black p-1 w-8">1</th>
                                <th className="border border-black p-1 w-8">2</th>
                                <th className="border border-black p-1 w-8">3</th>
                                <th className="border border-black p-1 w-8">4</th>
                                <th className="border border-black p-1 w-8">5</th>
                                <th className="border border-black p-1 w-8">6</th>
                                <th className="border border-black p-1 w-10"></th>
                                <th className="border border-black p-1 w-10"></th>
                                <th className="border border-black p-1 min-w-[100px]">TP Tertinggi</th>
                                <th className="border border-black p-1 min-w-[100px]">TP Terendah</th>
                            </tr>
                        </thead>
                        <tbody>
                            {students.sort((a, b) => a.fullName.localeCompare(b.fullName)).map((s, i) => (
                                <tr key={s.id} className="h-8">
                                    <td className="border border-black p-1">{i + 1}</td>
                                    <td className="border border-black p-1 text-left px-2">{s.fullName}</td>
                                    <td className="border border-black"></td>
                                    <td className="border border-black"></td>
                                    <td className="border border-black"></td>
                                    <td className="border border-black"></td>
                                    <td className="border border-black"></td>
                                    <td className="border border-black"></td>
                                    <td className="border border-black bg-gray-50"></td>
                                    <td className="border border-black"></td>
                                    <td className="border border-black"></td>
                                    <td className="border border-black bg-gray-50"></td>
                                    <td className="border border-black bg-gray-100"></td>
                                    <td className="border border-black"></td>
                                    <td className="border border-black"></td>
                                </tr>
                            ))}
                            {Array.from({ length: Math.max(0, 28 - students.length) }).map((_, i) => (
                                <tr key={`empty-${i}`} className="h-8">
                                    <td className="border border-black"></td>
                                    <td className="border border-black"></td>
                                    <td className="border border-black"></td>
                                    <td className="border border-black"></td>
                                    <td className="border border-black"></td>
                                    <td className="border border-black"></td>
                                    <td className="border border-black"></td>
                                    <td className="border border-black"></td>
                                    <td className="border border-black bg-gray-50"></td>
                                    <td className="border border-black"></td>
                                    <td className="border border-black"></td>
                                    <td className="border border-black bg-gray-50"></td>
                                    <td className="border border-black bg-gray-100"></td>
                                    <td className="border border-black"></td>
                                    <td className="border border-black"></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default StudentGradesList;
