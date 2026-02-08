
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Student, SchoolIdentity, Teacher } from '../types';
import { getStudents, updateStudents, getSchoolIdentity, getTeacherProfile } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { TrashIcon, ArrowDownTrayIcon, SparklesIcon } from './Icons';

declare const jspdf: any;

interface StudentListProps {
    selectedClass: string;
    selectedYear: string;
    userId?: string;
}

// Komponen Pemuatan
const LoadingState = () => (
    <div className="text-center p-8 text-gray-600 flex items-center justify-center">
        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Memuat data...
    </div>
);

// Komponen Input Tabel yang bisa wrap text
const WrappingInput = ({ value, onChange, onPaste }: { 
    value: string; 
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; 
    onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void; 
}) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useLayoutEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = `${textarea.scrollHeight}px`;
        }
    }, [value]);

    return (
        <textarea
            ref={textareaRef}
            value={value}
            onChange={onChange}
            onPaste={onPaste}
            className="w-full p-2 border-none bg-transparent focus:outline-none focus:bg-indigo-50 rounded resize-none overflow-hidden block"
            rows={1}
        />
    );
};

const DateInput = ({ value, onChange, onPaste }: { value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void; }) => (
     <input
        type="date"
        value={value}
        onChange={onChange}
        onPaste={onPaste}
        className="w-full h-full p-2 border-none bg-transparent focus:outline-none focus:bg-indigo-50 rounded"
    />
);

const StudentList: React.FC<StudentListProps> = ({ selectedClass, selectedYear, userId }) => {
    const [students, setStudents] = useState<Student[]>([]);
    const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity | null>(null);
    const [teacherProfile, setTeacherProfile] = useState<Teacher | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);
    const [signatureDate, setSignatureDate] = useState(new Date().toISOString().split('T')[0]); // Format YYYY-MM-DD
    const [isPdfDropdownOpen, setIsPdfDropdownOpen] = useState(false);

    useEffect(() => {
        const fetchAllData = async () => {
            setIsLoading(true);
            setNotification(null);
            try {
                const [studentsData, identityData, teacherData] = await Promise.all([
                    getStudents(selectedYear, selectedClass, userId),
                    getSchoolIdentity(userId),
                    getTeacherProfile(selectedYear, selectedClass, userId),
                ]);
                setStudents(studentsData);
                setSchoolIdentity(identityData);
                setTeacherProfile(teacherData);
            } catch (error: any) {
                setNotification({ message: error.message || 'Gagal memuat data.', type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchAllData();
    }, [selectedClass, selectedYear, userId]);
    
    const createEmptyStudent = (id: string): Student => ({
        id,
        fullName: '', nickname: '', gender: '', nis: '', nisn: '',
        birthPlace: '', birthDate: '', religion: '',
        address: { street: '', rtRw: '', dusun: '', desa: '', kecamatan: '' },
        parents: { ayah: '', ibu: '', wali: '' },
        phone: '',
    });

    const handleStudentChange = (index: number, field: keyof Student, value: any) => {
        const newStudents = [...students];
        (newStudents[index] as any)[field] = value;
        setStudents(newStudents);
    };

    const handleNestedChange = (index: number, category: 'address' | 'parents', field: string, value: string) => {
        const newStudents = [...students];
        (newStudents[index][category] as any)[field] = value;
        setStudents(newStudents);
    };

    const handleAddRow = () => {
        setStudents([...students, createEmptyStudent(`new-${Date.now()}`)]);
    };

    const handleRemoveRow = (index: number) => {
        setStudents(students.filter((_, i) => i !== index));
    };
    
    const formatDateForInput = (dateString: string): string => {
        const cleanedDateString = dateString.trim().replace(/^"|"$/g, '');
        if (/^\d{4}-\d{2}-\d{2}$/.test(cleanedDateString)) return cleanedDateString;
        const parts = cleanedDateString.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
        if (parts) {
            const day = parts[1].padStart(2, '0');
            const month = parts[2].padStart(2, '0');
            const year = parts[3];
            if (parseInt(month, 10) > 0 && parseInt(month, 10) <= 12 && parseInt(day, 10) > 0 && parseInt(day, 10) <= 31) {
                 return `${year}-${month}-${day}`;
            }
        }
        const d = new Date(cleanedDateString);
        if (!isNaN(d.getTime())) {
            const year = d.getFullYear();
            const month = (d.getMonth() + 1).toString().padStart(2, '0');
            const day = d.getDate().toString().padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
        return cleanedDateString;
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>, startRowIndex: number, startColIndex: number) => {
        e.preventDefault();
        const pasteData = e.clipboardData.getData('text/plain');
        const rows = pasteData.split(/\r\n|\n/).filter(row => row.trim() !== '');
        const newStudents = [...students];
        const columnMap: { [key: number]: string } = {
            1: 'fullName', 2: 'nickname', 3: 'gender', 4: 'nis', 5: 'nisn',
            6: 'birthPlace', 7: 'birthDate', 8: 'religion', 9: 'address.street',
            10: 'address.rtRw', 11: 'address.dusun', 12: 'address.desa',
            13: 'address.kecamatan', 14: 'parents.ayah', 15: 'parents.ibu',
            16: 'parents.wali', 17: 'phone',
        };
        rows.forEach((row, rowIndex) => {
            const cells = row.split('\t');
            const targetRowIndex = startRowIndex + rowIndex;
            if (targetRowIndex >= newStudents.length) {
                newStudents.push(createEmptyStudent(`new-${Date.now()}-${targetRowIndex}`));
            }
            cells.forEach((cell, cellIndex) => {
                const targetColIndex = startColIndex + cellIndex;
                const fieldKey = columnMap[targetColIndex];
                if (fieldKey) {
                    let valueToSet: any = cell;
                    if (fieldKey === 'birthDate') valueToSet = formatDateForInput(cell);
                    if (fieldKey.includes('.')) {
                        const [category, field] = fieldKey.split('.') as ['address' | 'parents', string];
                         if (newStudents[targetRowIndex][category]) {
                            (newStudents[targetRowIndex][category] as any)[field] = valueToSet;
                        }
                    } else {
                        (newStudents[targetRowIndex] as any)[fieldKey] = valueToSet;
                    }
                }
            });
        });
        setStudents(newStudents);
        setNotification({ message: 'Data berhasil ditempelkan dari clipboard.', type: 'info' });
    };

    const handleSave = async () => {
        setIsSaving(true);
        setNotification(null);
        try {
            await updateStudents(selectedYear, selectedClass, students, userId);
            setNotification({ message: 'Data siswa berhasil disimpan.', type: 'success' });
        } catch (error: any) {
            setNotification({ message: error.message || 'Gagal menyimpan data.', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDownloadPDF = async (signatureOption: 'none' | 'teacher' | 'both') => {
        setIsPdfDropdownOpen(false);
        setIsSaving(true);
        setNotification({ message: 'Mempersiapkan PDF, mohon tunggu...', type: 'info' });
        await new Promise(resolve => setTimeout(resolve, 50));

        try {
            const { jsPDF } = jspdf;
            // F4 Landscape: 330mm x 215mm
            const pdf = new jsPDF({
                orientation: 'landscape',
                unit: 'mm',
                format: [330, 215]
            });

            // Margins sedikit disesuaikan agar muat dengan nyaman
            const margin = { top: 15, right: 10, bottom: 12, left: 10 };
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            let startY = margin.top;

            // 1. Header
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            pdf.text(`DAFTAR PESERTA DIDIK ${selectedClass.toUpperCase()}`, pageWidth / 2, startY, { align: 'center' });
            startY += 6;
            pdf.text(schoolIdentity?.schoolName.toUpperCase() || 'NAMA SEKOLAH', pageWidth / 2, startY, { align: 'center' });
            startY += 6;
            pdf.setFontSize(11);
            pdf.text(`TAHUN PELAJARAN ${selectedYear}`, pageWidth / 2, startY, { align: 'center' });
            startY += 8;

            // 2. Table Data Preparation
            const head = [
                [
                    { content: 'NO', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
                    { content: 'NAMA LENGKAP', rowSpan: 2, styles: { valign: 'middle' } },
                    { content: 'NAMA PANGGILAN', rowSpan: 2, styles: { valign: 'middle' } },
                    { content: 'JK', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
                    { content: 'NIS', rowSpan: 2, styles: { valign: 'middle' } },
                    { content: 'NISN', rowSpan: 2, styles: { valign: 'middle' } },
                    { content: 'TEMPAT LAHIR', rowSpan: 2, styles: { valign: 'middle' } },
                    { content: 'TANGGAL LAHIR', rowSpan: 2, styles: { valign: 'middle' } },
                    { content: 'AGAMA', rowSpan: 2, styles: { valign: 'middle' } },
                    { content: 'ALAMAT', colSpan: 5, styles: { halign: 'center' } },
                    { content: 'Orang Tua/Wali', colSpan: 3, styles: { halign: 'center' } },
                    { content: 'NO. HP', rowSpan: 2, styles: { valign: 'middle' } },
                ],
                ['Jalan', 'RT/RW', 'Dusun', 'Desa', 'Kecamatan', 'Ayah', 'Ibu', 'Wali']
            ];

            const actualStudents = students.filter(s => s.fullName && s.fullName.trim() !== '');
            const body = actualStudents.map((s, i) => [
                i + 1, s.fullName, s.nickname, s.gender, s.nis, s.nisn, s.birthPlace,
                s.birthDate ? new Date(s.birthDate + 'T00:00:00').toLocaleDateString('id-ID', {day: '2-digit', month: '2-digit', year: 'numeric'}) : '',
                s.religion, s.address.street, s.address.rtRw, s.address.dusun,
                s.address.desa, s.address.kecamatan, s.parents.ayah, s.parents.ibu,
                s.parents.wali, s.phone
            ]);

            // LOGIKA PADDING: Minimal 15 baris sesuai permintaan
            const FORCED_MIN_ROWS = 15;
            if (body.length < FORCED_MIN_ROWS) {
                const rowsToAdd = FORCED_MIN_ROWS - body.length;
                for (let i = 0; i < rowsToAdd; i++) {
                    body.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
                }
            }

            (pdf as any).autoTable({
                head: head,
                body: body,
                startY: startY,
                theme: 'grid',
                headStyles: {
                    fillColor: [245, 245, 245],
                    textColor: [0, 0, 0],
                    fontStyle: 'bold',
                    halign: 'center',
                    valign: 'middle',
                    lineWidth: 0.1,
                    lineColor: [0, 0, 0],
                    fontSize: 8
                },
                bodyStyles: {
                    textColor: [0, 0, 0],
                    minCellHeight: 7.5 // Menjaga tinggi baris tetap standar (7.5mm)
                },
                styles: {
                    fontSize: 7.5,
                    cellPadding: 1.5,
                    lineWidth: 0.1,
                    lineColor: [0, 0, 0],
                    valign: 'middle'
                },
                columnStyles: {
                    0: { cellWidth: 8, halign: 'center' }, 
                    2: { cellWidth: 22 }, 
                    3: { cellWidth: 8, halign: 'center' },
                    7: { cellWidth: 22 }, 
                    17: { cellWidth: 25 },
                },
                margin: { left: margin.left, right: margin.right },
            });

            // 3. Footer (Signature)
            if (signatureOption !== 'none') {
                const finalY = (pdf as any).lastAutoTable.finalY;
                
                // Jarak tanda tangan rapat dengan tabel (7mm)
                let signatureY = finalY + 7;

                // Cek apakah cukup ruang untuk blok tanda tangan (~35mm) agar tetap di halaman yang sama
                if (signatureY + 35 > pageHeight - margin.bottom) {
                    pdf.addPage();
                    signatureY = margin.top + 5;
                }
                
                const formattedSignatureDate = new Date(signatureDate + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'normal');

                if (signatureOption === 'both' && schoolIdentity) {
                    const principalSignatureX = margin.left + 20;
                    pdf.text('Mengetahui,', principalSignatureX, signatureY);
                    pdf.text('Kepala Sekolah', principalSignatureX, signatureY + 5);
                    pdf.setFont('helvetica', 'bold');
                    const principalName = schoolIdentity.principalName || '.....................................';
                    pdf.text(principalName, principalSignatureX, signatureY + 25);
                    const principalNameWidth = pdf.getStringUnitWidth(principalName) * pdf.internal.getFontSize() / pdf.internal.scaleFactor;
                    pdf.setLineWidth(0.2);
                    pdf.line(principalSignatureX, signatureY + 25.5, principalSignatureX + principalNameWidth, signatureY + 25.5);
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${schoolIdentity.principalNip || '...................'}`, principalSignatureX, signatureY + 30);
                }
    
                if (signatureOption === 'teacher' || signatureOption === 'both') {
                    const signatureX = pageWidth - margin.right - 80;
                    pdf.text(`${schoolIdentity?.city || '...................'}, ${formattedSignatureDate}`, signatureX, signatureY);
                    pdf.text(`Wali ${selectedClass}`, signatureX, signatureY + 5);
                    pdf.setFont('helvetica', 'bold');
                    const teacherName = teacherProfile?.fullName || '.....................................';
                    pdf.text(teacherName, signatureX, signatureY + 25);
                    const teacherNameWidth = pdf.getStringUnitWidth(teacherName) * pdf.internal.getFontSize() / pdf.internal.scaleFactor;
                    pdf.setLineWidth(0.2);
                    pdf.line(signatureX, signatureY + 25.5, signatureX + teacherNameWidth, signatureY + 25.5);
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${teacherProfile?.nip || '...................'}`, signatureX, signatureY + 30);
                }
            }

            const fileName = `Daftar-Siswa-${selectedClass.replace(' ', '_')}-TA-${selectedYear.replace('/', '-')}.pdf`;
            pdf.save(fileName);
            setNotification({ message: `PDF berhasil dibuat: ${fileName}`, type: 'success' });
        } catch (error) {
            console.error(error);
            setNotification({ message: 'Terjadi kesalahan saat membuat PDF.', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };


    if (isLoading) return <LoadingState />;

    const formattedSignatureDate = new Date(signatureDate + 'T00:00:00').toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    return (
        <>
            <div className="flex justify-end mb-4 space-x-2 items-center">
                <button onClick={handleAddRow} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold shadow">
                    + Tambah Baris
                </button>
                <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold shadow disabled:bg-green-400">
                    {isSaving ? 'Menyimpan...' : 'Simpan Data'}
                </button>
                <div className="flex items-center space-x-2">
                    <label htmlFor="signatureDate" className="text-sm font-medium text-gray-700 shrink-0">Tanggal Cetak:</label>
                    <input
                        type="date"
                        id="signatureDate"
                        value={signatureDate}
                        onChange={(e) => setSignatureDate(e.target.value)}
                        className="block w-full px-2 py-1 border border-gray-300 rounded-md shadow-sm sm:text-sm"
                    />
                </div>
                 <div className="relative">
                    <button 
                        onClick={() => setIsPdfDropdownOpen(!isPdfDropdownOpen)} 
                        disabled={isSaving} 
                        className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-semibold shadow flex items-center space-x-2 disabled:bg-gray-400"
                    >
                        <ArrowDownTrayIcon /> <span>Download PDF</span>
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
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            
            <div className="bg-white p-8 rounded-xl shadow-lg">
                <div className="bg-blue-50 border-l-4 border-blue-500 text-blue-700 p-4 mb-6 rounded-r-lg" role="alert">
                    <div className="flex">
                        <div className="py-1"><SparklesIcon className="h-5 w-5 text-blue-500 mr-3"/></div>
                        <div>
                            <p className="font-bold">Pro Tip!</p>
                            <p className="text-sm">Anda bisa menyalin (copy) beberapa baris dan kolom dari Excel/Sheets dan menempelkannya (paste) langsung ke dalam tabel ini.</p>
                        </div>
                    </div>
                </div>

                <header className="text-center mb-6">
                    <h1 className="text-xl font-bold uppercase">DAFTAR PESERTA DIDIK {selectedClass.toUpperCase()}</h1>
                    <h2 className="text-xl font-bold uppercase">{schoolIdentity?.schoolName || '.......................'}</h2>
                    <h3 className="text-lg font-bold">TAHUN PELAJARAN {selectedYear}</h3>
                </header>

                <div className="overflow-x-auto">
                    <table className="table-auto border-collapse border border-black text-sm" style={{ width: '100%', tableLayout: 'auto' }}>
                        <thead className="text-center font-bold bg-gray-100">
                            <tr>
                                <th rowSpan={2} className="border border-black p-2 align-middle" style={{ minWidth: '40px' }}>NO</th>
                                <th rowSpan={2} className="border border-black p-2 align-middle" style={{ minWidth: '180px' }}>NAMA LENGKAP</th>
                                <th rowSpan={2} className="border border-black p-2 align-middle" style={{ minWidth: '90px' }}>NAMA PANGGILAN</th>
                                <th rowSpan={2} className="border border-black p-2 align-middle" style={{ minWidth: '40px' }}>JK</th>
                                <th rowSpan={2} className="border border-black p-2 align-middle" style={{ minWidth: '60px' }}>NIS</th>
                                <th rowSpan={2} className="border border-black p-2 align-middle" style={{ minWidth: '100px' }}>NISN</th>
                                <th rowSpan={2} className="border border-black p-2 align-middle" style={{ minWidth: '120px' }}>TEMPAT LAHIR</th>
                                <th rowSpan={2} className="border border-black p-2 align-middle" style={{ minWidth: '100px' }}>TANGGAL LAHIR</th>
                                <th rowSpan={2} className="border border-black p-2 align-middle" style={{ minWidth: '80px' }}>AGAMA</th>
                                <th colSpan={5} className="border border-black p-2 align-middle">ALAMAT</th>
                                <th colSpan={3} className="border border-black p-2 align-middle">Orang Tua/Wali</th>
                                <th rowSpan={2} className="border border-black p-2 align-middle" style={{ minWidth: '120px' }}>NO. HP</th>
                                <th rowSpan={2} className="border border-black p-1 align-middle" style={{ minWidth: '40px' }}></th>
                            </tr>
                            <tr>
                                <th className="border border-black p-2 align-middle" style={{ minWidth: '100px' }}>Jalan</th>
                                <th className="border border-black p-2 align-middle" style={{ minWidth: '60px' }}>RT/RW</th>
                                <th className="border border-black p-2 align-middle" style={{ minWidth: '120px' }}>Dusun</th>
                                <th className="border border-black p-2 align-middle" style={{ minWidth: '120px' }}>Desa</th>
                                <th className="border border-black p-2 align-middle" style={{ minWidth: '120px' }}>Kecamatan</th>
                                <th className="border border-black p-2 align-middle" style={{ minWidth: '150px' }}>Ayah</th>
                                <th className="border border-black p-2 align-middle" style={{ minWidth: '150px' }}>Ibu</th>
                                <th className="border border-black p-2 align-middle" style={{ minWidth: '150px' }}>Wali</th>
                            </tr>
                        </thead>
                        <tbody>
                            {students.map((student, index) => (
                                <tr key={student.id}>
                                    <td className="border border-black p-2 text-center align-top">{index + 1}</td>
                                    <td className="border border-black whitespace-normal align-top"><WrappingInput value={student.fullName} onChange={e => handleStudentChange(index, 'fullName', e.target.value)} onPaste={e => handlePaste(e, index, 1)} /></td>
                                    <td className="border border-black whitespace-normal align-top"><WrappingInput value={student.nickname} onChange={e => handleStudentChange(index, 'nickname', e.target.value)} onPaste={e => handlePaste(e, index, 2)} /></td>
                                    <td className="border border-black whitespace-normal text-center align-top"><WrappingInput value={student.gender} onChange={e => handleStudentChange(index, 'gender', e.target.value)} onPaste={e => handlePaste(e, index, 3)} /></td>
                                    <td className="border border-black whitespace-normal align-top"><WrappingInput value={student.nis} onChange={e => handleStudentChange(index, 'nis', e.target.value)} onPaste={e => handlePaste(e, index, 4)} /></td>
                                    <td className="border border-black whitespace-normal align-top"><WrappingInput value={student.nisn} onChange={e => handleStudentChange(index, 'nisn', e.target.value)} onPaste={e => handlePaste(e, index, 5)} /></td>
                                    <td className="border border-black whitespace-normal align-top"><WrappingInput value={student.birthPlace} onChange={e => handleStudentChange(index, 'birthPlace', e.target.value)} onPaste={e => handlePaste(e, index, 6)} /></td>
                                    <td className="border border-black whitespace-normal align-top"><DateInput value={student.birthDate} onChange={e => handleStudentChange(index, 'birthDate', e.target.value)} onPaste={e => handlePaste(e, index, 7)} /></td>
                                    <td className="border border-black whitespace-normal align-top"><WrappingInput value={student.religion} onChange={e => handleStudentChange(index, 'religion', e.target.value)} onPaste={e => handlePaste(e, index, 8)} /></td>
                                    <td className="border border-black whitespace-normal align-top"><WrappingInput value={student.address.street} onChange={e => handleNestedChange(index, 'address', 'street', e.target.value)} onPaste={e => handlePaste(e, index, 9)} /></td>
                                    <td className="border border-black whitespace-normal align-top"><WrappingInput value={student.address.rtRw} onChange={e => handleNestedChange(index, 'address', 'rtRw', e.target.value)} onPaste={e => handlePaste(e, index, 10)} /></td>
                                    <td className="border border-black whitespace-normal align-top"><WrappingInput value={student.address.dusun} onChange={e => handleNestedChange(index, 'address', 'dusun', e.target.value)} onPaste={e => handlePaste(e, index, 11)} /></td>
                                    <td className="border border-black whitespace-normal align-top"><WrappingInput value={student.address.desa} onChange={e => handleNestedChange(index, 'address', 'desa', e.target.value)} onPaste={e => handlePaste(e, index, 12)} /></td>
                                    <td className="border border-black whitespace-normal align-top"><WrappingInput value={student.address.kecamatan} onChange={e => handleNestedChange(index, 'address', 'kecamatan', e.target.value)} onPaste={e => handlePaste(e, index, 13)} /></td>
                                    <td className="border border-black whitespace-normal align-top"><WrappingInput value={student.parents.ayah} onChange={e => handleNestedChange(index, 'parents', 'ayah', e.target.value)} onPaste={e => handlePaste(e, index, 14)} /></td>
                                    <td className="border border-black whitespace-normal align-top"><WrappingInput value={student.parents.ibu} onChange={e => handleNestedChange(index, 'parents', 'ibu', e.target.value)} onPaste={e => handlePaste(e, index, 15)} /></td>
                                    <td className="border border-black whitespace-normal align-top"><WrappingInput value={student.parents.wali} onChange={e => handleNestedChange(index, 'parents', 'wali', e.target.value)} onPaste={e => handlePaste(e, index, 16)} /></td>
                                    <td className="border border-black whitespace-normal align-top"><WrappingInput value={student.phone} onChange={e => handleStudentChange(index, 'phone', e.target.value)} onPaste={e => handlePaste(e, index, 17)} /></td>
                                    <td className="border border-black align-top"><button onClick={() => handleRemoveRow(index)} className="p-1 text-red-500 hover:text-red-700"><TrashIcon className="w-4 h-4" /></button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                
                <footer className="mt-12 flex justify-between">
                    <div>
                        <p className="font-bold">Mengetahui,</p>
                        <p>Kepala Sekolah</p>
                        <div className="h-20"></div>
                        <p className="font-bold underline">{schoolIdentity?.principalName || '.....................................'}</p>
                        <p>NIP. {schoolIdentity?.principalNip || '.....................................'}</p>
                    </div>
                    <div className="text-center">
                        <p>{schoolIdentity?.city || '...................'}, {formattedSignatureDate}</p>
                        <p>Wali {selectedClass}</p>
                        <div className="h-20"></div>
                        <p className="font-bold underline">{teacherProfile?.fullName || '.....................................'}</p>
                        <p>NIP. {teacherProfile?.nip || '.....................................'}</p>
                    </div>
                </footer>
            </div>
        </>
    );
};

export default StudentList;
