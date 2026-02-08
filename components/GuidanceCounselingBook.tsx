
import React, { useState, useEffect } from 'react';
import { Teacher, SchoolIdentity } from '../types';
import { getTeacherProfile, getSchoolIdentity } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { ArrowDownTrayIcon } from './Icons';

declare const jspdf: any;

interface GuidanceCounselingBookProps {
    selectedClass: string;
    selectedYear: string;
    userId?: string;
}

// Target 15 baris agar pas 1 lembar F4 Landscape dengan margin atas 2cm dan tanda tangan
const DEFAULT_ROW_COUNT = 15; 

const GuidanceCounselingBook: React.FC<GuidanceCounselingBookProps> = ({ selectedClass, selectedYear, userId }) => {
    const [semester, setSemester] = useState<'Ganjil' | 'Genap'>('Ganjil');
    const [teacher, setTeacher] = useState<Teacher | null>(null);
    const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);
    const [signatureDate, setSignatureDate] = useState(new Date().toISOString().split('T')[0]);
    const [isPdfDropdownOpen, setIsPdfDropdownOpen] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                // SINKRONISASI: Mengambil data dari database guru jika userId tersedia
                const [teacherProfile, identity] = await Promise.all([
                    getTeacherProfile(selectedYear, selectedClass, userId),
                    getSchoolIdentity(userId)
                ]);
                
                setTeacher(teacherProfile);
                setSchoolIdentity(identity);
            } catch (error: any) {
                setNotification({ message: error.message || 'Gagal memuat data.', type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [selectedClass, selectedYear, userId]);

    const handleDownloadPDF = async (signatureOption: 'none' | 'teacher' | 'both') => {
        if (!schoolIdentity || !teacher) {
            setNotification({ message: 'Data tidak lengkap untuk membuat PDF.', type: 'error' });
            return;
        }

        setIsGeneratingPDF(true);
        setIsPdfDropdownOpen(false);
        setNotification({ message: 'Mempersiapkan PDF...', type: 'info' });
        await new Promise(r => setTimeout(r, 50));

        try {
            const { jsPDF } = jspdf;
            // F4 Landscape: 330mm x 215mm
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [330, 215] });

            // Margin: Atas 2cm (20mm), Lainnya 1cm (10mm)
            const margin = { top: 20, right: 10, bottom: 10, left: 10 };
            const pageWidth = pdf.internal.pageSize.getWidth();
            let y = margin.top;

            // --- HEADER ---
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.text(`BUKU BIMBINGAN DAN KONSELING`, pageWidth / 2, y, { align: 'center' });
            y += 6;
            pdf.setFontSize(12);
            pdf.text(`${schoolIdentity.schoolName.toUpperCase()}`, pageWidth / 2, y, { align: 'center' });
            y += 6;
            pdf.setFontSize(11);
            pdf.text(`KELAS: ${selectedClass.toUpperCase().replace('KELAS ', '')}   SEMESTER: ${semester.toUpperCase()}   TAHUN AJARAN: ${selectedYear}`, pageWidth / 2, y, { align: 'center' });
            y += 10; // Spasi sebelum tabel
            
            // Header Tabel diganti "Keterangan" -> "Tanda Tangan"
            const head = [['No.', 'Hari/Tanggal', 'Nama Siswa', 'Masalah / Perilaku / Topik', 'Bentuk Layanan / Tindak Lanjut', 'Hasil', 'Tanda Tangan']];
            
            // Generate baris kosong sejumlah DEFAULT_ROW_COUNT
            const body = [];
            for (let i = 0; i < DEFAULT_ROW_COUNT; i++) {
                body.push(['', '', '', '', '', '', '']);
            }

            (pdf as any).autoTable({
                head, 
                body, 
                startY: y, 
                theme: 'grid',
                headStyles: {
                    fillColor: [255, 255, 255], // Putih
                    textColor: [0, 0, 0],       // Hitam
                    fontStyle: 'bold',
                    halign: 'center', 
                    valign: 'middle', 
                    lineColor: 0, 
                    lineWidth: 0.1
                },
                styles: { 
                    fontSize: 8, 
                    lineColor: 0, 
                    lineWidth: 0.1, 
                    cellPadding: 1.5, 
                    valign: 'top',
                    minCellHeight: 7 // Tinggi baris 7mm agar muat 15 baris + TTD dalam 215mm page height
                },
                columnStyles: {
                    0: { cellWidth: 10, halign: 'center' },        // No.
                    1: { cellWidth: 30, halign: 'center' },        // Tanggal
                    2: { cellWidth: 50 },                           // Nama Siswa
                    3: { cellWidth: 65 },                           // Masalah
                    4: { cellWidth: 65 },                           // Layanan
                    5: { cellWidth: 50 },                           // Hasil
                    6: { cellWidth: 40 },                           // Tanda Tangan
                },
                margin: { left: margin.left, right: margin.right, bottom: margin.bottom }
            });
            
            y = (pdf as any).lastAutoTable.finalY + 10;
            
            // Cek halaman baru untuk tanda tangan
            // Page Height 215mm. Margin bottom 10mm. Signature block needs approx 35-40mm.
            const pageHeight = pdf.internal.pageSize.getHeight();
            if (y + 35 > pageHeight - margin.bottom) {
                pdf.addPage();
                y = margin.top;
            }

            // --- TANDA TANGAN ---
            if (signatureOption !== 'none') {
                // Digeser ke 40mm dari kiri agar ada space untuk stempel
                const principalX = margin.left + 40; 
                const teacherX = pageWidth - margin.right - 60;
                const formattedDate = new Date(signatureDate + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'normal');

                if (signatureOption === 'both') {
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
                }
                
                if (signatureOption === 'teacher' || signatureOption === 'both') {
                    pdf.text(`${schoolIdentity.city || '...................'}, ${formattedDate}`, teacherX, y, { align: 'center' });
                    pdf.text(`Guru Kelas ${selectedClass.replace('Kelas ', '')}`, teacherX, y + 5, { align: 'center' });
                    
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

            pdf.save(`Buku-BK-${selectedClass.replace(' ', '_')}-${semester}.pdf`);
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
            
            <div className="flex justify-end items-center mb-4 space-x-2">
                <label htmlFor="signatureDate" className="text-sm font-medium text-gray-700 shrink-0">Tanggal Cetak:</label>
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
                        disabled={isGeneratingPDF}
                        className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-semibold shadow disabled:bg-gray-400"
                    >
                        <ArrowDownTrayIcon className="w-5 h-5"/> <span>{isGeneratingPDF ? 'Memproses...' : 'Download PDF'}</span>
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
            </div>

            <div id="printable-area" className="border p-4 bg-gray-50">
                <div className="text-center mb-6">
                    <h2 className="text-xl font-bold uppercase">
                        BUKU BIMBINGAN DAN KONSELING
                    </h2>
                    <p className="text-lg font-semibold uppercase">{schoolIdentity?.schoolName}</p>
                    <div className="text-md flex items-center justify-center space-x-2">
                        <span>KELAS: {selectedClass.toUpperCase().replace('KELAS ', '')}</span>
                        <span className="mx-2">|</span>
                        <span>SEMESTER:</span>
                        <select
                            value={semester}
                            onChange={(e) => setSemester(e.target.value as 'Ganjil' | 'Genap')}
                            className="p-1 border-b-2 bg-transparent font-medium focus:outline-none"
                        >
                            <option>Ganjil</option>
                            <option>Genap</option>
                        </select>
                        <span className="mx-2">|</span>
                        <span>TAHUN AJARAN {selectedYear}</span>
                    </div>
                </div>

                <div className="overflow-x-auto border rounded-lg bg-white">
                    <table className="w-full text-sm border-collapse">
                        <thead className="bg-indigo-100 text-center font-bold">
                            <tr>
                                <th className="border p-2 w-10">No.</th>
                                <th className="border p-2 w-32">Hari/Tanggal</th>
                                <th className="border p-2 w-48">Nama Siswa</th>
                                <th className="border p-2 w-64">Masalah / Perilaku / Topik</th>
                                <th className="border p-2 w-64">Bentuk Layanan / Tindak Lanjut</th>
                                <th className="border p-2 w-48">Hasil</th>
                                <th className="border p-2 w-32">Tanda Tangan</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Array.from({ length: DEFAULT_ROW_COUNT }).map((_, index) => (
                                <tr key={index} className="align-top" style={{ height: '35px' }}>
                                    <td className="border p-2 text-center text-gray-400"></td>
                                    <td className="border p-2"></td>
                                    <td className="border p-2"></td>
                                    <td className="border p-2"></td>
                                    <td className="border p-2"></td>
                                    <td className="border p-2"></td>
                                    <td className="border p-2"></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default GuidanceCounselingBook;
