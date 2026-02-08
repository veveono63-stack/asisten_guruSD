
import React, { useState, useEffect } from 'react';
import { ClassAgreementData, SchoolIdentity, Teacher, ClassStructure } from '../types';
import { getClassAgreement, updateClassAgreement, getSchoolIdentity, getTeacherProfile, getClassStructure, pullClassAgreementToTeacher } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { PencilIcon, TrashIcon, SparklesIcon, ArrowDownTrayIcon, ArrowPathIcon } from './Icons';
import { Type } from '@google/genai';
import { generateContentWithRotation } from '../services/geminiService';

declare const jspdf: any;

interface ClassAgreementProps {
    selectedClass: string;
    selectedYear: string;
    userId?: string;
}

const ClassAgreement: React.FC<ClassAgreementProps> = ({ selectedClass, selectedYear, userId }) => {
    const [agreementData, setAgreementData] = useState<ClassAgreementData | null>(null);
    /* COMMENT: Added originalAgreementData state to support cancellation of edits */
    const [originalAgreementData, setOriginalAgreementData] = useState<ClassAgreementData | null>(null);
    const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity | null>(null);
    const [teacher, setTeacher] = useState<Teacher | null>(null);
    const [classStructure, setClassStructure] = useState<ClassStructure | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isPulling, setIsPulling] = useState(false);
    const [isPullModalOpen, setIsPullModalOpen] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);
    const [agreementCount, setAgreementCount] = useState<number>(7);
    const [signatureDate, setSignatureDate] = useState(new Date().toISOString().split('T')[0]);
    const [isPdfDropdownOpen, setIsPdfDropdownOpen] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            setNotification(null);
            try {
                // SINKRONISASI: Mengambil data dari database guru jika userId tersedia
                const [agreement, identity, teacherProfile, structure] = await Promise.all([
                    getClassAgreement(selectedYear, selectedClass, userId),
                    getSchoolIdentity(userId),
                    getTeacherProfile(selectedYear, selectedClass, userId),
                    getClassStructure(selectedYear, selectedClass, userId)
                ]);
                setAgreementData(agreement);
                setSchoolIdentity(identity);
                setTeacher(teacherProfile);
                setClassStructure(structure);
            } catch (error: any) {
                setNotification({ message: error.message || 'Gagal memuat data.', type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [selectedClass, selectedYear, userId]);

    const handleAgreementChange = (index: number, value: string) => {
        if (!agreementData) return;
        const newAgreements = [...agreementData.agreements];
        newAgreements[index] = value;
        setAgreementData({ agreements: newAgreements });
    };

    const handleAddAgreement = () => {
        if (!agreementData) return;
        setAgreementData({ agreements: [...agreementData.agreements, ''] });
    };

    const handleRemoveAgreement = (index: number) => {
        if (!agreementData) return;
        const newAgreements = agreementData.agreements.filter((_, i) => i !== index);
        setAgreementData({ agreements: newAgreements });
    };
    
    /* COMMENT: Added handleEdit function to save a snapshot of data before editing */
    const handleEdit = () => {
        setOriginalAgreementData(JSON.parse(JSON.stringify(agreementData)));
        setIsEditing(true);
    };

    /* COMMENT: Added handleCancel function to revert changes when editing is cancelled */
    const handleCancel = () => {
        if (originalAgreementData) setAgreementData(originalAgreementData);
        setIsEditing(false);
    };

    const handleSave = async () => {
        if (!agreementData) return;
        setIsSaving(true);
        setNotification(null);
        try {
            await updateClassAgreement(selectedYear, selectedClass, agreementData, userId);
            setNotification({ message: 'Kesepakatan kelas berhasil disimpan.', type: 'success' });
            setIsEditing(false);
        } catch (error: any) {
            setNotification({ message: error.message || 'Gagal menyimpan data.', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };
    
    const handlePullFromMaster = async () => {
        if (!userId) return;
        setIsPulling(true);
        setNotification(null);
        try {
            const masterAgreement = await pullClassAgreementToTeacher(selectedYear, selectedClass, userId);
            setAgreementData(masterAgreement);
            setNotification({ message: 'Kesepakatan berhasil disinkronkan dengan data Induk Admin!', type: 'success' });
            setIsPullModalOpen(false);
        } catch (error: any) {
            setNotification({ message: error.message, type: 'error' });
        } finally {
            setIsPulling(false);
        }
    };

    const handleGenerateWithAI = async () => {
        if (agreementCount <= 0) {
            setNotification({ message: 'Jumlah kesepakatan harus lebih dari 0.', type: 'error' });
            return;
        }

        setIsGenerating(true);
        setNotification({ message: 'AI sedang membuat kesepakatan kelas, mohon tunggu...', type: 'info' });

        try {
            const prompt = `
                Anda adalah seorang ahli pendidik sekolah dasar yang berpengalaman dalam menciptakan lingkungan belajar yang positif.
                Tugas Anda adalah membuat daftar kesepakatan kelas (tata tertib) untuk siswa ${selectedClass}.

                Aturan:
                1. Buat tepat ${agreementCount} butir kesepakatan.
                2. Semua kesepakatan HARUS menggunakan kalimat positif (contoh: "Saling menghormati teman" bukan "Jangan mengejek teman").
                3. Gunakan bahasa yang sederhana, singkat, jelas, dan mudah dipahami oleh anak-anak usia sekolah dasar.
                4. Fokus pada tema-tema seperti tanggung jawab, rasa hormat, kebersihan, ketertiban, dan semangat belajar.
                5. Setiap butir kesepakatan harus ditulis dengan HURUF KAPITAL.

                Berikan jawaban HANYA dalam format array JSON string yang valid. Contoh: ["KESAPAKATAN SATU", "KESAPAKATAN DUA"]
            `;

            const response = await generateContentWithRotation({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.STRING
                        }
                    },
                },
            });

            const jsonText = response.text.trim();
            const generatedAgreements = JSON.parse(jsonText);
            
            if (Array.isArray(generatedAgreements)) {
                setAgreementData({ agreements: generatedAgreements });
                setNotification({ message: 'Kesepakatan kelas berhasil dibuat oleh AI!', type: 'success' });
            } else {
                throw new Error("Format respons dari AI tidak valid.");
            }

        } catch (error) {
            console.error("AI Generation Error:", error);
            setNotification({ message: 'Gagal menghasilkan kesepakatan dengan AI. Silakan coba lagi.', type: 'error' });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDownloadPDF = async (signatureOption: 'none' | 'teacher' | 'both' | 'president') => {
        setIsGeneratingPDF(true);
        setIsPdfDropdownOpen(false);
        setNotification({ message: 'Mempersiapkan PDF...', type: 'info' });
        await new Promise(resolve => setTimeout(resolve, 50));
    
        if (!agreementData || !schoolIdentity || !teacher || !classStructure) {
            setNotification({ message: 'Gagal membuat PDF: Data tidak lengkap.', type: 'error' });
            setIsGeneratingPDF(false);
            return;
        }
    
        try {
            const { jsPDF } = jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [215, 330] });
            
            const margin = { top: 20, left: 25, right: 20, bottom: 20 };
            const contentWidth = 215 - margin.left - margin.right;
            const pageHeight = 330;

            // --- PRE-CALCULATION FOR BORDER HEIGHT ---
            let tempY = margin.top;
            tempY += 7; // Header line 1
            tempY += 6; // Header line 2
            tempY += 6; // Header line 3
            tempY += 15; // Space after header

            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(12);
            agreementData.agreements.forEach((agreement, index) => {
                const numberText = `${index + 1}.`;
                const numberWidth = pdf.getStringUnitWidth(numberText) * pdf.internal.getFontSize() / pdf.internal.scaleFactor + 2;
                const agreementLines = pdf.splitTextToSize(agreement.toUpperCase(), contentWidth - numberWidth);
                tempY += (agreementLines.length * 6) + 4;
            });

            let finalContentY = tempY;
            if (signatureOption !== 'none') {
                const signatureBlockHeight = 40;
                const yWithPadding = tempY + 20;
                const signatureY = Math.max(yWithPadding, pageHeight - margin.bottom - signatureBlockHeight);
                finalContentY = signatureY + 34; // Approx end of signature block
            }
            // --- END PRE-CALCULATION ---
    
            // --- DRAWING ---
            let y = margin.top;

            // Draw outer border
            const borderX = margin.left - 7;
            const borderY = margin.top - 7;
            const borderWidth = contentWidth + 14;
            const borderHeight = (finalContentY - margin.top) + 14; // Add padding top and bottom
            pdf.setDrawColor(0, 0, 0); // black
            pdf.setLineWidth(0.5);
            pdf.roundedRect(borderX, borderY, borderWidth, borderHeight, 5, 5, 'S'); // 'S' for stroke
    
            // Header
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.text(`KESEPAKATAN ${selectedClass.toUpperCase()}`, 107.5, y, { align: 'center' });
            y += 7;
            pdf.setFontSize(12);
            pdf.text(schoolIdentity.schoolName.toUpperCase(), 107.5, y, { align: 'center' });
            y += 6;
            pdf.text(`TAHUN AJARAN ${selectedYear}`, 107.5, y, { align: 'center' });
            y += 15;
    
            // Agreements
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(12);
            agreementData.agreements.forEach((agreement, index) => {
                if (y > pageHeight - margin.bottom - 20) { // Check for page break
                    pdf.addPage();
                    // Note: Border will not be drawn on the new page.
                    y = margin.top;
                }
                const numberText = `${index + 1}.`;
                const numberWidth = pdf.getStringUnitWidth(numberText) * pdf.internal.getFontSize() / pdf.internal.scaleFactor + 2;
                pdf.text(numberText, margin.left, y);
                
                const agreementLines = pdf.splitTextToSize(agreement.toUpperCase(), contentWidth - numberWidth);
                pdf.text(agreementLines, margin.left + numberWidth, y);
                y += (agreementLines.length * 6) + 4; // Adjust line spacing
            });
    
            // Signatures
            if (signatureOption !== 'none') {
                const signatureBlockHeight = 40;
                if (y > pageHeight - margin.bottom - signatureBlockHeight - 10) {
                    pdf.addPage();
                    y = margin.top + 20;
                } else {
                    y += 20;
                }
    
                let signatureY = Math.max(y, pageHeight - margin.bottom - signatureBlockHeight);
                
                pdf.setFontSize(11);
                pdf.setFont('helvetica', 'normal');
                const formattedDate = new Date(signatureDate + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    
                const leftSignatureX = margin.left + 40;
                const rightSignatureX = 215 - margin.right - 40;
                
                if (['teacher', 'both', 'president'].includes(signatureOption)) {
                    pdf.text(`${schoolIdentity.city || '...................'}, ${formattedDate}`, rightSignatureX, signatureY, { align: 'center' });
                    pdf.text(`Wali Kelas ${selectedClass}`, rightSignatureX, signatureY + 6, { align: 'center' });
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(teacher.fullName, rightSignatureX, signatureY + 28, { align: 'center' });
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${teacher.nip}`, rightSignatureX, signatureY + 34, { align: 'center' });
                }
    
                if (signatureOption === 'both') {
                    pdf.text('Mengetahui,', leftSignatureX, signatureY, { align: 'center' });
                    pdf.text('Kepala Sekolah', leftSignatureX, signatureY + 6, { align: 'center' });
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(schoolIdentity.principalName, leftSignatureX, signatureY + 28, { align: 'center' });
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${schoolIdentity.principalNip}`, leftSignatureX, signatureY + 34, { align: 'center' });
                } else if (signatureOption === 'president') {
                    pdf.text('', leftSignatureX, signatureY, { align: 'center' });
                    pdf.text('Ketua Kelas', leftSignatureX, signatureY + 6, { align: 'center' });
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(classStructure.president || '.....................................', leftSignatureX, signatureY + 28, { align: 'center' });
                }
            }
    
            const fileName = `Kesepakatan-Kelas-${selectedClass.replace(' ', '_')}-${selectedYear.replace('/', '-')}.pdf`;
            pdf.save(fileName);
            setNotification({ message: 'PDF berhasil dibuat.', type: 'success' });
    
        } catch (error) {
            console.error(error);
            setNotification({ message: 'Gagal membuat PDF.', type: 'error' });
        } finally {
            setIsGeneratingPDF(false);
        }
    };


    if (isLoading) return <div className="text-center p-8">Memuat data kesepakatan kelas...</div>;
    if (!agreementData || !schoolIdentity || !teacher || !classStructure) return <div className="text-center p-8 text-red-500">Gagal memuat data penting.</div>;

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-4xl mx-auto">
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            
            <div className="flex justify-end items-center mb-4 space-x-2">
                {isEditing ? (
                    <>
                        <button onClick={handleCancel} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold">Batal</button>
                        <button onClick={handleSave} disabled={isSaving || isGenerating} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold disabled:bg-indigo-400">{isSaving ? 'Menyimpan...' : 'Simpan'}</button>
                    </>
                ) : (
                    <>
                        {userId && (
                            <button 
                                onClick={() => setIsPullModalOpen(true)}
                                disabled={isPulling}
                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold shadow flex items-center space-x-2 disabled:bg-purple-400 text-sm"
                            >
                                {isPulling ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
                                <span>Tarik dari Induk</span>
                            </button>
                        )}
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
                                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-semibold shadow flex items-center space-x-2 disabled:bg-gray-400"
                            >
                                <ArrowDownTrayIcon /> <span>{isGeneratingPDF ? 'Memproses...' : 'Download PDF'}</span>
                            </button>
                            {isPdfDropdownOpen && (
                                <div
                                    className="absolute right-0 mt-2 w-60 bg-white rounded-md shadow-lg z-10 border"
                                    onMouseLeave={() => setIsPdfDropdownOpen(false)}
                                >
                                    <ul className="py-1">
                                        <li><button onClick={() => handleDownloadPDF('none')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Tanpa TTD</button></li>
                                        <li><button onClick={() => handleDownloadPDF('teacher')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">TTD Wali Kelas</button></li>
                                        <li><button onClick={() => handleDownloadPDF('both')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">TTD Wali Kelas & KS</button></li>
                                        <li><button onClick={() => handleDownloadPDF('president')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">TTD Wali Kelas & Ketua Kelas</button></li>
                                    </ul>
                                </div>
                            )}
                        </div>
                        {/* COMMENT: Changed from direct state set to handleEdit for consistency */}
                        <button onClick={handleEdit} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold shadow flex items-center space-x-2"><PencilIcon /> <span>Edit</span></button>
                    </>
                )}
            </div>

            <div className="text-center mb-8">
                <h2 className="text-xl font-bold text-gray-800 tracking-wider">KESEPAKATAN {selectedClass.toUpperCase()}</h2>
                <p className="text-lg font-semibold text-gray-700 mt-1">{schoolIdentity.schoolName.toUpperCase()}</p>
                <p className="text-md text-gray-600">TAHUN AJARAN {selectedYear}</p>
            </div>

            {isEditing && (
                 <div className="mb-6 p-4 border-2 border-dashed border-purple-300 bg-purple-50 rounded-lg">
                    <h3 className="text-lg font-semibold text-purple-800 mb-3">Generate dengan AI</h3>
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                            <label htmlFor="agreementCount" className="text-sm font-medium text-gray-700">Jumlah Kesepakatan:</label>
                            <input
                                type="number"
                                id="agreementCount"
                                value={agreementCount}
                                onChange={(e) => setAgreementCount(parseInt(e.target.value, 10))}
                                className="w-20 p-2 border border-gray-300 rounded-md"
                                min="1"
                            />
                        </div>
                        <button
                            onClick={handleGenerateWithAI}
                            disabled={isGenerating || isSaving}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold shadow flex items-center space-x-2 disabled:bg-purple-300"
                        >
                            {isGenerating ? (
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            ) : (
                                <SparklesIcon />
                            )}
                            <span>{isGenerating ? 'Memproses...' : 'Generate'}</span>
                        </button>
                    </div>
                </div>
            )}
            
            <div className="border-t pt-4">
                <table className="w-full">
                    <tbody className="divide-y divide-gray-200">
                        {agreementData.agreements.map((agreement, index) => (
                            <tr key={index}>
                                <td className="py-2 pr-4 text-lg font-semibold text-gray-600 align-top w-10">{index + 1}.</td>
                                <td className="py-2 w-full">
                                    {isEditing ? (
                                        <div className="flex items-center">
                                            <input
                                                type="text"
                                                value={agreement}
                                                onChange={(e) => handleAgreementChange(index, e.target.value)}
                                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                                placeholder="Tulis kesepakatan di sini..."
                                            />
                                            <button onClick={() => handleRemoveAgreement(index)} className="ml-2 text-red-500 hover:text-red-700 p-1">
                                                <TrashIcon />
                                            </button>
                                        </div>
                                    ) : (
                                        <p className="text-lg text-gray-800">{agreement}</p>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                 {isEditing && (
                    <div className="mt-4">
                        <button onClick={handleAddAgreement} className="text-sm text-indigo-600 hover:text-indigo-800 font-semibold">
                            + Tambah Kesepakatan
                        </button>
                    </div>
                )}
            </div>

            {/* Modal Konfirmasi Tarik Data Induk */}
            {isPullModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black bg-opacity-60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all animate-fade-in scale-100">
                        <div className="p-6">
                            <div className="flex items-center justify-center w-16 h-16 mx-auto bg-purple-100 rounded-full mb-4">
                                <SparklesIcon className="w-10 h-10 text-purple-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Tarik Kesepakatan Induk?</h3>
                            <p className="text-gray-600 text-center text-sm mb-6">
                                Anda akan menyalin data kesepakatan kelas dari Admin khusus untuk <span className="font-bold">{selectedClass}</span>. 
                                <br/><br/>
                                <span className="text-red-600 font-bold">Peringatan:</span> Kesepakatan yang Anda buat sendiri saat ini akan <span className="underline">ditimpa sepenuhnya</span>.
                            </p>
                            <div className="flex flex-col gap-2">
                                <button 
                                    onClick={handlePullFromMaster}
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

            <style>{`.btn-primary{display:inline-flex;align-items:center;gap:.5rem;padding:.5rem 1rem;background-color:#4f46e5;color:#fff;border-radius:.5rem;font-weight:600}.btn-primary:disabled{opacity:.6;cursor:not-allowed}.btn-secondary{display:inline-flex;align-items:center;gap:.5rem;padding:.5rem 1rem;background-color:#e5e7eb;color:#1f2937;border-radius:.5rem;font-weight:600}.btn-ai{display:inline-flex;align-items:center;gap:.5rem;padding:.5rem 1rem;background-color:#9333ea;color:#fff;border-radius:.5rem;font-weight:600}.btn-ai:disabled{opacity:.6;cursor:not-allowed}`}</style>
        </div>
    );
};

export default ClassAgreement;
