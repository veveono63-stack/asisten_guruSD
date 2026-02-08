
import React, { useState, useEffect } from 'react';
import { InventoryListData, InventoryItem, SchoolIdentity, Teacher } from '../types';
import { getInventoryList, updateInventoryList, getSchoolIdentity, getTeacherProfile } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { PencilIcon, TrashIcon, ArrowDownTrayIcon } from './Icons';

declare const jspdf: any;

interface InventoryListProps {
    selectedClass: string;
    selectedYear: string;
    userId?: string;
}

const InventoryList: React.FC<InventoryListProps> = ({ selectedClass, selectedYear, userId }) => {
    const [inventoryData, setInventoryData] = useState<InventoryListData | null>(null);
    const [originalInventoryData, setOriginalInventoryData] = useState<InventoryListData | null>(null);
    const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity | null>(null);
    const [teacher, setTeacher] = useState<Teacher | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);
    const [signatureDate, setSignatureDate] = useState(new Date().toISOString().split('T')[0]);
    const [isPdfDropdownOpen, setIsPdfDropdownOpen] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            setNotification(null);
            setIsEditing(false); // Reset editing state on data change
            try {
                const [data, identity, teacherProfile] = await Promise.all([
                    getInventoryList(selectedYear, selectedClass, userId),
                    getSchoolIdentity(userId),
                    getTeacherProfile(selectedYear, selectedClass, userId)
                ]);
                setInventoryData(data);
                setSchoolIdentity(identity);
                setTeacher(teacherProfile);
            } catch (error: any) {
                setNotification({ message: error.message || 'Gagal memuat data.', type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [selectedClass, selectedYear, userId]);

    const handleEdit = () => {
        setOriginalInventoryData(JSON.parse(JSON.stringify(inventoryData))); // Deep copy for cancel
        setIsEditing(true);
    };

    const handleCancel = () => {
        setInventoryData(originalInventoryData);
        setIsEditing(false);
        setNotification(null);
    };

    const handleSave = async () => {
        if (!inventoryData) return;
        setIsSaving(true);
        setNotification(null);
        try {
            await updateInventoryList(selectedYear, selectedClass, inventoryData, userId);
            setNotification({ message: 'Daftar inventaris berhasil disimpan.', type: 'success' });
            setIsEditing(false);
        } catch (error: any) {
            setNotification({ message: error.message || 'Gagal menyimpan data.', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleItemChange = (index: number, field: keyof InventoryItem, value: string | number) => {
        if (!inventoryData) return;
    
        const newItems = [...inventoryData.items];
        const itemToUpdate = { ...newItems[index] };
        const numericValue = typeof value === 'string' ? parseInt(value, 10) || 0 : value;
    
        (itemToUpdate as any)[field] = (typeof (itemToUpdate as any)[field] === 'number') ? numericValue : value;
    
        if (field === 'quantity') {
            itemToUpdate.conditionGood = numericValue;
            itemToUpdate.conditionLightDamage = 0;
            itemToUpdate.conditionMediumDamage = 0;
            itemToUpdate.conditionHeavyDamage = 0;
        } else if (['conditionGood', 'conditionLightDamage', 'conditionMediumDamage', 'conditionHeavyDamage'].includes(field)) {
            const light = field === 'conditionLightDamage' ? numericValue : itemToUpdate.conditionLightDamage;
            const medium = field === 'conditionMediumDamage' ? numericValue : itemToUpdate.conditionMediumDamage;
            const heavy = field === 'conditionHeavyDamage' ? numericValue : itemToUpdate.conditionHeavyDamage;
            const good = field === 'conditionGood' ? numericValue : itemToUpdate.conditionGood;
            
            // If user directly edits the good condition, we adjust the total quantity.
            if (field === 'conditionGood') {
                 itemToUpdate.quantity = good + light + medium + heavy;
            } else {
            // Otherwise, if a damaged condition is edited, we recalculate 'Good' based on total quantity.
                 const totalDamaged = light + medium + heavy;
                 itemToUpdate.conditionGood = Math.max(0, itemToUpdate.quantity - totalDamaged);
            }
        }
    
        newItems[index] = itemToUpdate;
        setInventoryData({ items: newItems });
    };

    const createEmptyItem = (itemName: string = ''): InventoryItem => ({
        id: `new-${Date.now()}-${Math.random()}`,
        itemName,
        quantity: 0,
        conditionGood: 0,
        conditionLightDamage: 0,
        conditionMediumDamage: 0,
        conditionHeavyDamage: 0,
        description: '',
    });
    
    const handleAddRow = () => {
        if (!inventoryData) return;
        setInventoryData({ items: [...inventoryData.items, createEmptyItem()] });
    };

    const handleRemoveRow = (id: string) => {
        if (!inventoryData) return;
        setInventoryData({ items: inventoryData.items.filter(item => item.id !== id) });
    };
    
    const handleDownloadPDF = async (signatureOption: 'none' | 'teacher' | 'both') => {
        setIsGeneratingPDF(true);
        setIsPdfDropdownOpen(false);
        setNotification({ message: 'Mempersiapkan PDF...', type: 'info' });
        await new Promise(resolve => setTimeout(resolve, 50));
    
        if (!inventoryData || !schoolIdentity || !teacher) {
            setNotification({ message: 'Gagal membuat PDF: Data tidak lengkap.', type: 'error' });
            setIsGeneratingPDF(false);
            return;
        }
    
        try {
            const { jsPDF } = jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [215, 330] });
            
            const margin = { top: 20, left: 25, right: 10, bottom: 10 };
            const pageWidth = pdf.internal.pageSize.getWidth();
            let y = margin.top;
    
            // Header
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            pdf.setTextColor(0, 0, 0);
            pdf.text(`DAFTAR INVENTARIS ${selectedClass.toUpperCase()}`, pageWidth / 2, y, { align: 'center' });
            y += 6;
            pdf.text(schoolIdentity.schoolName.toUpperCase(), pageWidth / 2, y, { align: 'center' });
            y += 6;
            pdf.setFontSize(11);
            pdf.text(`TAHUN AJARAN ${selectedYear}`, pageWidth / 2, y, { align: 'center' });
            y += 10;
    
            // Table
            const head = [
                [
                    { content: 'NO', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
                    { content: 'NAMA BARANG', rowSpan: 2, styles: { valign: 'middle' } },
                    { content: 'JUMLAH', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
                    { content: 'KONDISI', colSpan: 4, styles: { halign: 'center' } },
                    { content: 'KETERANGAN', rowSpan: 2, styles: { valign: 'middle' } },
                ],
                ['B', 'RR', 'RS', 'RB']
            ];
            
            const body = inventoryData.items.map((item, index) => [
                index + 1,
                item.itemName,
                item.quantity === 0 ? '' : item.quantity,
                item.conditionGood === 0 ? '' : item.conditionGood,
                item.conditionLightDamage === 0 ? '' : item.conditionLightDamage,
                item.conditionMediumDamage === 0 ? '' : item.conditionMediumDamage,
                item.conditionHeavyDamage === 0 ? '' : item.conditionHeavyDamage,
                item.description,
            ]);
    
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
                    valign: 'middle',
                    textColor: [0, 0, 0],
                    lineColor: [0, 0, 0],
                    lineWidth: 0.1
                },
                columnStyles: {
                    0: { cellWidth: 10, halign: 'center' },
                    1: { cellWidth: 60 },
                    2: { cellWidth: 20, halign: 'center' },
                    3: { cellWidth: 12, halign: 'center' },
                    4: { cellWidth: 12, halign: 'center' },
                    5: { cellWidth: 12, halign: 'center' },
                    6: { cellWidth: 12, halign: 'center' },
                },
                margin: { left: margin.left, right: margin.right }
            });
    
            y = (pdf as any).lastAutoTable.finalY + 5;
            
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'normal');
            pdf.text('Keterangan Kondisi: B = Baik, RR = Rusak Ringan, RS = Rusak Sedang, RB = Rusak Berat', margin.left, y);
            
            y += 15;
    
            // Signatures
            if (signatureOption !== 'none') {
                const pageHeight = pdf.internal.pageSize.getHeight();
                if (y > pageHeight - 50) pdf.addPage();
                
                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'normal');
                const formattedDate = new Date(signatureDate + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    
                if (signatureOption === 'both') {
                    const principalX = margin.left + 50;
                    const teacherX = pageWidth - margin.right - 50;

                    pdf.text('Mengetahui,', principalX, y, { align: 'center' });
                    pdf.text('Kepala Sekolah', principalX, y + 5, { align: 'center' });
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(schoolIdentity.principalName, principalX, y + 25, { align: 'center' });
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${schoolIdentity.principalNip}`, principalX, y + 30, { align: 'center' });

                    pdf.text(`${schoolIdentity.city || '...................'}, ${formattedDate}`, teacherX, y, { align: 'center' });
                    pdf.text(`Wali ${selectedClass}`, teacherX, y + 5, { align: 'center' });
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(teacher.fullName, teacherX, y + 25, { align: 'center' });
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${teacher.nip}`, teacherX, y + 30, { align: 'center' });

                } else if (signatureOption === 'teacher') {
                    const teacherX = pageWidth - margin.right - 50;
                    pdf.text(`${schoolIdentity.city || '...................'}, ${formattedDate}`, teacherX, y, { align: 'center' });
                    pdf.text(`Wali ${selectedClass}`, teacherX, y + 5, { align: 'center' });
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(teacher.fullName, teacherX, y + 25, { align: 'center' });
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${teacher.nip}`, teacherX, y + 30, { align: 'center' });
                }
            }
    
            pdf.save(`Inventaris-Kelas-${selectedClass.replace(' ', '_')}-${selectedYear.replace('/', '-')}.pdf`);
            setNotification({ message: 'PDF berhasil dibuat.', type: 'success' });
    
        } catch (error) {
            console.error(error);
            setNotification({ message: 'Gagal membuat PDF.', type: 'error' });
        } finally {
            setIsGeneratingPDF(false);
        }
    };


    if (isLoading) return <div className="text-center p-8">Memuat data inventaris...</div>;
    if (!inventoryData) return <div className="text-center p-8 text-red-500">Gagal memuat data.</div>;
    
    return (
        <div className="bg-white p-8 rounded-xl shadow-lg">
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            
            <div className="flex justify-between items-center mb-4">
                 <div className="text-left">
                    <h2 className="text-xl font-bold text-gray-800">DAFTAR INVENTARIS KELAS</h2>
                    <p className="text-md text-gray-600">{schoolIdentity?.schoolName} - T.A {selectedYear}</p>
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
                            <button onClick={handleEdit} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold shadow flex items-center space-x-2">
                                <PencilIcon /> <span>Edit</span>
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-full text-sm">
                    <thead className="bg-indigo-100 text-center uppercase">
                        <tr>
                            <th rowSpan={2} className="p-2 border">NO</th>
                            <th rowSpan={2} className="p-2 border">NAMA BARANG</th>
                            <th rowSpan={2} className="p-2 border">JUMLAH</th>
                            <th colSpan={4} className="p-2 border">KONDISI</th>
                            <th rowSpan={2} className="p-2 border">KETERANGAN</th>
                             {isEditing && <th rowSpan={2} className="p-2 border w-12">Aksi</th>}
                        </tr>
                        <tr>
                            <th className="p-2 border font-semibold w-16">B</th>
                            <th className="p-2 border font-semibold w-16">RR</th>
                            <th className="p-2 border font-semibold w-16">RS</th>
                            <th className="p-2 border font-semibold w-16">RB</th>
                        </tr>
                    </thead>
                    <tbody>
                        {inventoryData.items.map((item, index) => (
                            <tr key={item.id} className="hover:bg-gray-50">
                                <td className="border p-2 text-center">{index + 1}</td>
                                <td className="border p-1">
                                    {isEditing ? <input type="text" value={item.itemName} onChange={e => handleItemChange(index, 'itemName', e.target.value)} className="w-full p-1 border-gray-200 rounded" /> : item.itemName}
                                </td>
                                <td className="border p-1 text-center">
                                    {isEditing ? <input type="number" value={item.quantity === 0 ? '' : item.quantity} onChange={e => handleItemChange(index, 'quantity', e.target.value)} placeholder="0" className="w-full p-1 text-center border-gray-200 rounded" /> : (item.quantity || '')}
                                </td>
                                <td className="border p-1 text-center bg-green-50">
                                    {isEditing ? <input type="number" value={item.conditionGood === 0 ? '' : item.conditionGood} onChange={e => handleItemChange(index, 'conditionGood', e.target.value)} placeholder="0" className="w-full p-1 text-center border-gray-200 rounded" /> : (item.conditionGood || '')}
                                </td>
                                <td className="border p-1 text-center bg-yellow-50">
                                    {isEditing ? <input type="number" value={item.conditionLightDamage === 0 ? '' : item.conditionLightDamage} onChange={e => handleItemChange(index, 'conditionLightDamage', e.target.value)} placeholder="0" className="w-full p-1 text-center border-gray-200 rounded" /> : (item.conditionLightDamage || '')}
                                </td>
                                <td className="border p-1 text-center bg-orange-50">
                                    {isEditing ? <input type="number" value={item.conditionMediumDamage === 0 ? '' : item.conditionMediumDamage} onChange={e => handleItemChange(index, 'conditionMediumDamage', e.target.value)} placeholder="0" className="w-full p-1 text-center border-gray-200 rounded" /> : (item.conditionMediumDamage || '')}
                                </td>
                                <td className="border p-1 text-center bg-red-50">
                                    {isEditing ? <input type="number" value={item.conditionHeavyDamage === 0 ? '' : item.conditionHeavyDamage} onChange={e => handleItemChange(index, 'conditionHeavyDamage', e.target.value)} placeholder="0" className="w-full p-1 text-center border-gray-200 rounded" /> : (item.conditionHeavyDamage || '')}
                                </td>
                                <td className="border p-1">
                                    {isEditing ? <input type="text" value={item.description} onChange={e => handleItemChange(index, 'description', e.target.value)} className="w-full p-1 border-gray-200 rounded" /> : item.description}
                                </td>
                                {isEditing && (
                                    <td className="border p-1 text-center">
                                        <button onClick={() => handleRemoveRow(item.id)} className="p-1 text-red-500 hover:text-red-700">
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))}
                         {isEditing && (
                            <tr>
                                <td colSpan={isEditing ? 9 : 8} className="p-2">
                                    <button onClick={handleAddRow} className="text-sm text-indigo-600 hover:text-indigo-800 font-semibold">
                                        + Tambah Baris Inventaris
                                    </button>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
             <div className="mt-4 text-xs text-gray-600">
                <p><span className="font-bold">Keterangan Kondisi:</span> B = Baik, RR = Rusak Ringan, RS = Rusak Sedang, RB = Rusak Berat</p>
            </div>
        </div>
    );
};

export default InventoryList;
