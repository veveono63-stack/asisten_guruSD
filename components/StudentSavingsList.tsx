
import React, { useState, useEffect, useMemo } from 'react';
import { StudentSavingsData, StudentSavings, SavingsTransaction, SchoolIdentity } from '../types';
import { getStudentSavings, updateStudentSavings, getSchoolIdentity, getStudents } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { PencilIcon, ArrowDownTrayIcon, ChevronDoubleLeftIcon, ChevronDoubleRightIcon, SparklesIcon } from './Icons';

declare const jspdf: any;

interface StudentSavingsListProps {
    selectedClass: string;
    selectedYear: string;
    userId?: string;
}

const StudentSavingsList: React.FC<StudentSavingsListProps> = ({ selectedClass, selectedYear, userId }) => {
    const [savingsData, setSavingsData] = useState<StudentSavingsData | null>(null);
    const [originalSavingsData, setOriginalSavingsData] = useState<StudentSavingsData | null>(null);
    const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const itemsPerPage = 1;

    // Jumlah baris standar mengikuti format Admin
    const STANDARD_ROW_COUNT = 25;

    // Helper untuk membuat ID unik cadangan
    const generateSafeId = () => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    };

    const createEmptyTransaction = () => ({
        id: generateSafeId(),
        date: '',
        deposit: 0,
        withdrawal: 0,
        balance: 0,
        signature: '',
        notes: ''
    });

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            setNotification(null);
            setIsEditing(false);
            setCurrentPage(1);
            setSearchQuery('');
            try {
                const [dbSavings, identity, masterStudents] = await Promise.all([
                    getStudentSavings(selectedYear, selectedClass, userId),
                    getSchoolIdentity(userId),
                    getStudents(selectedYear, selectedClass, userId)
                ]);

                setSchoolIdentity(identity);

                // --- LOGIKA SINKRONISASI OTOMATIS ---
                const currentSavings = dbSavings?.savings || [];
                const currentStudentIds = new Set(currentSavings.map(s => s.studentId));
                // Hanya ambil siswa yang punya nama
                const activeMasterStudents = masterStudents.filter(s => s.fullName && s.fullName.trim() !== '');
                
                const newEntries: StudentSavings[] = [];
                activeMasterStudents.forEach(student => {
                    if (!currentStudentIds.has(student.id)) {
                        // Gunakan nama panggilan jika tersedia, jika tidak gunakan nama lengkap
                        const displayName = student.nickname && student.nickname.trim() !== '' 
                            ? student.nickname 
                            : student.fullName;

                        newEntries.push({
                            studentId: student.id,
                            studentName: displayName,
                            transactions: Array.from({ length: STANDARD_ROW_COUNT }, createEmptyTransaction)
                        });
                    }
                });

                if (newEntries.length > 0) {
                    const mergedData = { savings: [...currentSavings, ...newEntries] };
                    setSavingsData(mergedData);
                    setNotification({ 
                        message: `Info: ${newEntries.length} siswa baru otomatis ditambahkan dari Daftar Siswa. Klik 'Simpan' untuk memperbarui database.`, 
                        type: 'info' 
                    });
                } else {
                    setSavingsData(dbSavings || { savings: [] });
                }
                // ------------------------------------

            } catch (error: any) {
                setNotification({ message: error.message || 'Gagal memuat data.', type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [selectedClass, selectedYear, userId]);

    // Reset page number when search query changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    const filteredStudents = useMemo(() => {
        if (!savingsData) return [];
        if (!searchQuery) return savingsData.savings;
        return savingsData.savings.filter(student =>
            student.studentName.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [savingsData, searchQuery]);


    const recalculateBalances = (transactions: SavingsTransaction[]): SavingsTransaction[] => {
        let currentBalance = 0;
        return transactions.map(tx => {
            currentBalance += (tx.deposit || 0) - (tx.withdrawal || 0);
            return { ...tx, balance: currentBalance };
        });
    };

    const handleTransactionChange = (studentIndex: number, txIndex: number, field: keyof SavingsTransaction, value: string | number) => {
        if (!savingsData) return;

        const studentData = savingsData.savings[studentIndex];
        if (!studentData) return;

        const newTransactions = [...studentData.transactions];
        const txToUpdate = { ...newTransactions[txIndex] };

        if (field === 'deposit' || field === 'withdrawal') {
            (txToUpdate as any)[field] = parseInt(value as string, 10) || 0;
        } else {
            (txToUpdate as any)[field] = value;
        }

        newTransactions[txIndex] = txToUpdate;
        const recalculatedTransactions = recalculateBalances(newTransactions);

        const newSavings = [...savingsData.savings];
        newSavings[studentIndex] = { ...studentData, transactions: recalculatedTransactions };
        setSavingsData({ savings: newSavings });
    };
    
    const handleStudentNameChange = (studentIndex: number, newName: string) => {
        if (!savingsData) return;
        const newSavings = [...savingsData.savings];
        newSavings[studentIndex].studentName = newName;
        setSavingsData({ savings: newSavings });
    }

    const handleEdit = () => {
        setOriginalSavingsData(JSON.parse(JSON.stringify(savingsData))); // Deep copy
        setIsEditing(true);
    };

    const handleCancel = () => {
        setSavingsData(originalSavingsData);
        setIsEditing(false);
    };

    const handleSave = async () => {
        if (!savingsData) return;
        setIsSaving(true);
        setNotification(null);
        try {
            await updateStudentSavings(selectedYear, selectedClass, savingsData, userId);
            setNotification({ message: 'Data tabungan berhasil disimpan.', type: 'success' });
            setIsEditing(false);
        } catch (error: any) {
            setNotification({ message: error.message || 'Gagal menyimpan data.', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDownloadPDF = async () => {
        if (!savingsData || savingsData.savings.length === 0) {
            setNotification({ message: 'Tidak ada data untuk diunduh.', type: 'info' });
            return;
        }
        setIsGeneratingPDF(true);
        setNotification({ message: 'Mempersiapkan PDF...', type: 'info' });
        await new Promise(resolve => setTimeout(resolve, 50));
    
        try {
            const { jsPDF } = jspdf;
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [330, 215] });
            
            const totalPages = Math.ceil(savingsData.savings.length / 3);
    
            for (let i = 0; i < totalPages; i++) {
                if (i > 0) pdf.addPage();
    
                const margin = { top: 20, left: 5, right: 5, bottom: 5 };
                const pageWidth = pdf.internal.pageSize.getWidth();
                const contentWidth = pageWidth - margin.left - margin.right;
                const tableGap = 4;
                const tableWidth = (contentWidth - (tableGap * 2)) / 3;
    
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(12);
                pdf.setTextColor(0, 0, 0);
                const title = `DAFTAR TABUNGAN SISWA ${selectedClass.toUpperCase()} ${schoolIdentity?.schoolName.toUpperCase() || ''} TAHUN AJARAN ${selectedYear}`;
                pdf.text(title, pageWidth / 2, 15, { align: 'center' });
    
                const pageStartIndex = i * 3;
                const pageStudents = savingsData.savings.slice(pageStartIndex, pageStartIndex + 3);
    
                pageStudents.forEach((student, j) => {
                    const startX = margin.left + (j * (tableWidth + tableGap));
                    let startY = margin.top;
    
                    const head = [
                        [{ content: student.studentName.toUpperCase(), colSpan: 6, styles: { fillColor: [229, 231, 235], fontStyle: 'bold' } }],
                        [
                            { content: 'TGL', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                            { content: 'MUTASI', colSpan: 2, styles: { halign: 'center' } },
                            { content: 'SALDO', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                            { content: 'TTD', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                            { content: 'KET', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } }
                        ],
                        ['MASUK', 'KELUAR']
                    ];
                    
                    // Pad transactions to STANDARD_ROW_COUNT for PDF consistency
                    const pdfTransactions = [...student.transactions];
                    while (pdfTransactions.length < STANDARD_ROW_COUNT) {
                        pdfTransactions.push(createEmptyTransaction() as any);
                    }
                    const limitedTransactions = pdfTransactions.slice(0, STANDARD_ROW_COUNT);

                    const body = limitedTransactions.map(tx => [
                        tx.date ? new Date(tx.date + 'T00:00:00Z').toLocaleDateString('id-ID') : '',
                        tx.deposit > 0 ? tx.deposit.toLocaleString('id-ID') : '',
                        tx.withdrawal > 0 ? tx.withdrawal.toLocaleString('id-ID') : '',
                        (tx.deposit || tx.withdrawal || tx.balance !== 0) ? tx.balance.toLocaleString('id-ID') : '',
                        tx.signature,
                        tx.notes
                    ]);
    
                    (pdf as any).autoTable({
                        head,
                        body,
                        startY,
                        theme: 'grid',
                        tableWidth,
                        margin: { left: startX },
                        headStyles: {
                            fontStyle: 'bold',
                            halign: 'center',
                            valign: 'middle',
                            lineWidth: 0.1,
                            lineColor: [0, 0, 0],
                            textColor: [0, 0, 0],
                            fillColor: [229, 231, 235], 
                            fontSize: 7
                        },
                        bodyStyles: {
                            lineWidth: 0.1,
                            lineColor: [0, 0, 0],
                            textColor: [0, 0, 0],
                            minCellHeight: 6.2, // Adjusted height for 25 rows
                        },
                        styles: { fontSize: 6.5, cellPadding: 0.8, valign: 'middle' },
                        columnStyles: {
                            0: { cellWidth: tableWidth * 0.17, halign: 'center' },
                            1: { cellWidth: tableWidth * 0.15, halign: 'right' },
                            2: { cellWidth: tableWidth * 0.15, halign: 'right' },
                            3: { cellWidth: tableWidth * 0.23, halign: 'right' },
                            4: { cellWidth: tableWidth * 0.1, halign: 'center' },
                            5: { cellWidth: tableWidth * 0.2, halign: 'left' },
                        }
                    });
                });
            }
    
            pdf.save(`Tabungan-Siswa-${selectedClass.replace(' ', '_')}-${selectedYear.replace('/', '-')}.pdf`);
            setNotification({ message: 'PDF berhasil dibuat.', type: 'success' });
    
        } catch (error) {
            console.error(error);
            setNotification({ message: 'Gagal membuat PDF.', type: 'error' });
        } finally {
            setIsGeneratingPDF(false);
        }
    };
    

    if (isLoading) return <div className="text-center p-8">Memuat data tabungan...</div>;
    
    const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentStudentData = filteredStudents.slice(startIndex, endIndex);

    return (
        <div className="bg-white p-6 rounded-xl shadow-lg">
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}

            <div className="flex justify-between items-center mb-4">
                <div className="text-left">
                    <h2 className="text-xl font-bold text-gray-800 uppercase">DAFTAR TABUNGAN SISWA</h2>
                    <p className="text-sm font-semibold text-gray-600">{schoolIdentity?.schoolName} - T.A {selectedYear}</p>
                </div>
                <div className="flex items-center space-x-2">
                     {isEditing ? (
                        <>
                            <button onClick={handleCancel} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold">Batal</button>
                            <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold disabled:bg-indigo-400">
                                {isSaving ? 'Menyimpan...' : 'Simpan'}
                            </button>
                        </>
                    ) : (
                         <>
                            <button onClick={handleDownloadPDF} disabled={isGeneratingPDF} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-semibold shadow flex items-center space-x-2 disabled:bg-gray-400">
                                <ArrowDownTrayIcon /> <span>{isGeneratingPDF ? 'Memproses...' : 'Download PDF'}</span>
                            </button>
                            <button onClick={handleEdit} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold shadow flex items-center space-x-2">
                                <PencilIcon /> <span>Edit Tabungan</span>
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="mb-4">
                <input
                    type="text"
                    placeholder="Cari nama siswa..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full max-w-sm p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                />
            </div>
            
            {filteredStudents.length > 0 ? (
            <>
                <div className="space-y-6">
                    {currentStudentData.map((student) => {
                        const studentRealIndex = savingsData!.savings.findIndex(s => s.studentId === student.studentId);
                        if(studentRealIndex === -1) return null;
                        
                        return (
                        <div key={student.studentId} className="border rounded-lg p-4 bg-gray-50">
                             <div className="mb-2 font-semibold text-gray-800 text-lg flex items-center">
                                {isEditing ? (
                                    <input
                                        type="text"
                                        value={student.studentName}
                                        onChange={(e) => handleStudentNameChange(studentRealIndex, e.target.value)}
                                        className="p-1 border rounded flex-grow font-bold text-lg"
                                    />
                                ) : (
                                    <span className="font-bold">{student.studentName.toUpperCase()}</span>
                                )}
                            </div>
                            <div className="overflow-auto max-h-[600px]">
                                <table className="w-full text-xs border-collapse border border-black">
                                    <thead className="text-center bg-gray-200 font-bold">
                                        <tr>
                                            <th rowSpan={2} className="border border-black p-1">TGL</th>
                                            <th colSpan={2} className="border border-black p-1">MUTASI</th>
                                            <th rowSpan={2} className="border border-black p-1">SALDO</th>
                                            <th rowSpan={2} className="border border-black p-1">TTD</th>
                                            <th rowSpan={2} className="border border-black p-1">KET</th>
                                        </tr>
                                        <tr>
                                            <th className="border border-black p-1">MASUK</th>
                                            <th className="border border-black p-1">KELUAR</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {student.transactions.map((tx, txIndex) => (
                                            <tr key={tx.id} style={{ height: '2.5rem' }}>
                                                <td className="border border-black p-0 w-28">
                                                    {isEditing ? <input type="date" value={tx.date} onChange={e => handleTransactionChange(studentRealIndex, txIndex, 'date', e.target.value)} className="w-full h-full p-1 border-none bg-transparent focus:outline-none" /> : <div className="p-1 text-center">{tx.date ? new Date(tx.date + 'T00:00:00Z').toLocaleDateString('id-ID') : ''}</div>}
                                                </td>
                                                <td className="border border-black p-0 w-24">
                                                    {isEditing ? <input type="number" value={tx.deposit === 0 ? '' : tx.deposit} onChange={e => handleTransactionChange(studentRealIndex, txIndex, 'deposit', e.target.value)} className="w-full h-full p-1 border-none text-right bg-transparent focus:outline-none" placeholder="0"/> : <div className="p-1 text-right">{tx.deposit > 0 ? tx.deposit.toLocaleString('id-ID') : ''}</div>}
                                                </td>
                                                <td className="border border-black p-0 w-24">
                                                    {isEditing ? <input type="number" value={tx.withdrawal === 0 ? '' : tx.withdrawal} onChange={e => handleTransactionChange(studentRealIndex, txIndex, 'withdrawal', e.target.value)} className="w-full h-full p-1 border-none text-right bg-transparent focus:outline-none" placeholder="0"/> : <div className="p-1 text-right">{tx.withdrawal > 0 ? tx.withdrawal.toLocaleString('id-ID') : ''}</div>}
                                                </td>
                                                <td className="border border-black p-1 text-right bg-gray-100 font-medium w-28">
                                                    {(tx.deposit || tx.withdrawal || tx.balance !== 0) ? tx.balance.toLocaleString('id-ID') : ''}
                                                </td>
                                                <td className="border border-black p-0 w-20">
                                                    {isEditing ? <input type="text" value={tx.signature} onChange={e => handleTransactionChange(studentRealIndex, txIndex, 'signature', e.target.value)} className="w-full h-full p-1 border-none bg-transparent focus:outline-none" /> : <div className="p-1 text-center">{tx.signature}</div>}
                                                </td>
                                                <td className="border border-black p-0">
                                                    {isEditing ? <input type="text" value={tx.notes} onChange={e => handleTransactionChange(studentRealIndex, txIndex, 'notes', e.target.value)} className="w-full h-full p-1 border-none bg-transparent focus:outline-none" /> : <div className="p-1">{tx.notes}</div>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )})}
                </div>
                
                {totalPages > 1 && (
                     <div className="mt-6 flex justify-center items-center space-x-2">
                        <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="p-2 rounded-md bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed">
                            <ChevronDoubleLeftIcon className="w-5 h-5" />
                        </button>
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-4 py-2 rounded-md bg-gray-200 hover:bg-gray-300 disabled:opacity-50">
                            Sebelumnya
                        </button>
                        <span className="text-sm font-medium text-gray-700">
                            Halaman {currentPage} dari {totalPages}
                        </span>
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-4 py-2 rounded-md bg-gray-200 hover:bg-gray-300 disabled:opacity-50">
                            Berikutnya
                        </button>
                         <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="p-2 rounded-md bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed">
                            <ChevronDoubleRightIcon className="w-5 h-5" />
                        </button>
                    </div>
                )}
            </>
            ) : (
                <div className="text-center py-16 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                    <SparklesIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 font-medium">
                        {savingsData?.savings.length === 0 
                            ? 'Belum ada data siswa. Nama siswa akan muncul otomatis di sini jika "Daftar Siswa" sudah diisi.' 
                            : `Tidak ada siswa yang cocok dengan pencarian "${searchQuery}".`}
                    </p>
                </div>
            )}
        </div>
    );
};

export default StudentSavingsList;
