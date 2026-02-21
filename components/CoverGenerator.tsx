import React, { useState, useEffect } from 'react';
import { SchoolIdentity, Teacher } from '../types';
import { getSchoolIdentity, getTeacherProfile } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { ArrowDownTrayIcon } from './Icons';
import { jsPDF } from 'jspdf';

interface CoverGeneratorProps {
    selectedClass: string;
    selectedYear: string;
    userId?: string;
}

const adminTitles = [
    "MODUL AJAR",
    "ALUR TUJUAN PEMBELAJARAN (ATP)",
    "PROGRAM SEMESTER (PROSEM)",
    "PROGRAM TAHUNAN (PROTA)",
    "KRITERIA KETERCAPAIAN TUJUAN PEMBELAJARAN (KKTP)",
    "JURNAL HARIAN MENGAJAR",
    "DAFTAR HADIR SISWA",
    "DAFTAR NILAI SISWA",
    "KALENDER PENDIDIKAN",
    "JADWAL PELAJARAN",
    "ADMINISTRASI GURU KELAS",
    "BUKU KERJA GURU",
    "PORTOFOLIO SISWA"
];

const CoverGenerator: React.FC<CoverGeneratorProps> = ({ selectedClass, selectedYear, userId }) => {
    const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity | null>(null);
    const [teacher, setTeacher] = useState<Teacher | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);

    // Form states
    const [title, setTitle] = useState(adminTitles[0]);
    const [customTitle, setCustomTitle] = useState("");
    const [logoUrl, setLogoUrl] = useState("https://kalibatur.tulungagungdaring.id/wp-content/uploads/sites/68/2017/12/Logo-Kabupaten-tulungagung-jawa-timur-223x300.png");
    const [includeSemester, setIncludeSemester] = useState(false);
    const [semester, setSemester] = useState("1 (Ganjil)");

    // Editable details
    const [details, setDetails] = useState({
        name: "",
        nip: "",
        school: "",
        className: "",
        phase: "",
        academicYear: ""
    });

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [identity, profile] = await Promise.all([
                    getSchoolIdentity(userId),
                    getTeacherProfile(selectedYear, selectedClass, userId)
                ]);
                
                setSchoolIdentity(identity);
                setTeacher(profile);

                // Helper for phase
                const getPhase = (cls: string) => {
                    const num = cls.replace('Kelas ', '');
                    const romanMap: { [key: string]: number } = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6 };
                    const n = romanMap[num] || 0;
                    if (n <= 2) return 'A';
                    if (n <= 4) return 'B';
                    return 'C';
                };

                setDetails({
                    name: profile?.fullName || "",
                    nip: profile?.nip || "",
                    school: identity?.schoolName || "",
                    className: selectedClass,
                    phase: getPhase(selectedClass),
                    academicYear: selectedYear
                });
            } catch (error: any) {
                setNotification({ message: "Gagal memuat data identitas.", type: "error" });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [selectedClass, selectedYear, userId]);

    const handleDownload = async () => {
        setIsGenerating(true);
        setNotification({ message: "Sedang membuat PDF...", type: "info" });

        try {
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: [215, 330] // F4 size
            });

            const pageWidth = 215;
            const pageHeight = 330;
            const leftMargin = 25; // 2.5 cm
            const rightMargin = 10;
            const centerX = (pageWidth + leftMargin - rightMargin) / 2;

            // 1. Draw Border/Frame (Adjusted for 2.5cm left margin)
            pdf.setLineWidth(1);
            pdf.rect(leftMargin, 10, pageWidth - leftMargin - rightMargin, pageHeight - 20);
            pdf.setLineWidth(0.3);
            pdf.rect(leftMargin + 2, 12, pageWidth - leftMargin - rightMargin - 4, pageHeight - 24);

            // 2. Title
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(24);
            const displayTitle = customTitle || title;
            const titleLines = pdf.splitTextToSize(displayTitle.toUpperCase(), pageWidth - leftMargin - rightMargin - 40);
            pdf.text(titleLines, centerX, 50, { align: 'center' });

            // 3. Logo
            try {
                // Use a different CORS proxy (corsproxy.io) which is often more reliable
                const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(logoUrl)}`;
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error("Failed to fetch image via proxy");
                
                const blob = await response.blob();
                const imgData = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
                
                // Get dimensions to maintain aspect ratio
                const img = new Image();
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = imgData;
                });
                
                const maxWidth = 60;
                const ratio = img.height / img.width;
                const imgWidth = maxWidth;
                const imgHeight = maxWidth * ratio;
                
                pdf.addImage(imgData, 'PNG', centerX - (imgWidth / 2), 100, imgWidth, imgHeight);
            } catch (e) {
                console.error("Failed to load logo via primary proxy", e);
                // Fallback to allorigins if corsproxy fails
                try {
                    const altProxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(logoUrl)}`;
                    const altResponse = await fetch(altProxyUrl);
                    if (!altResponse.ok) throw new Error("Failed to fetch image via alt proxy");
                    const altBlob = await altResponse.blob();
                    const altImgData = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.onerror = reject;
                        reader.readAsDataURL(altBlob);
                    });
                    const img = new Image();
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                        img.src = altImgData;
                    });
                    const maxWidth = 60;
                    const ratio = img.height / img.width;
                    pdf.addImage(altImgData, 'PNG', centerX - (maxWidth / 2), 100, maxWidth, maxWidth * ratio);
                } catch (fallbackError) {
                    console.error("All proxies failed", fallbackError);
                    pdf.setFontSize(10);
                    pdf.setFont('helvetica', 'italic');
                    pdf.text("[Logo tidak dapat dimuat]", centerX, 120, { align: 'center' });
                }
            }

            // 4. Details
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            
            let currentY = 220;
            const labelX = leftMargin + 30;
            const colonX = leftMargin + 75; // Fixed position for colons
            const valueX = leftMargin + 80;
            const lineSpacing = 10;
            const boxPadding = 5;
            const boxWidth = pageWidth - leftMargin - rightMargin - 40;
            const boxHeight = (includeSemester ? 7 : 6) * lineSpacing + boxPadding;

            // Draw Identity Box Outline
            pdf.setLineWidth(0.5);
            pdf.rect(leftMargin + 20, currentY - 10, boxWidth, boxHeight);

            const drawDetail = (label: string, value: string) => {
                pdf.text(label, labelX, currentY);
                pdf.text(":", colonX, currentY);
                pdf.text(value, valueX, currentY);
                currentY += lineSpacing;
            };

            drawDetail("NAMA", details.name);
            drawDetail("NIP", details.nip);
            drawDetail("SEKOLAH", details.school);
            drawDetail("KELAS", details.className.replace('Kelas ', ''));
            drawDetail("FASE", details.phase);
            
            if (includeSemester) {
                drawDetail("SEMESTER", semester);
            }
            
            drawDetail("TAHUN AJARAN", details.academicYear);

            pdf.save(`Cover_${displayTitle.replace(/\s+/g, '_')}.pdf`);
            setNotification({ message: "Cover berhasil didownload.", type: "success" });
        } catch (error: any) {
            console.error(error);
            setNotification({ message: "Gagal membuat PDF.", type: "error" });
        } finally {
            setIsGenerating(false);
        }
    };

    if (isLoading) return <div className="text-center p-8">Memuat data...</div>;

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-4xl mx-auto">
            {notification && (
                <Notification 
                    message={notification.message} 
                    type={notification.type} 
                    onClose={() => setNotification(null)} 
                />
            )}

            <div className="mb-8 border-b pb-4">
                <h2 className="text-2xl font-bold text-gray-800">Pembuat Sampul / Cover</h2>
                <p className="text-gray-600">Generate cover administrasi format F4 secara otomatis.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Configuration Form */}
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Judul Administrasi</label>
                        <select 
                            value={title} 
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full p-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            {adminTitles.map(t => <option key={t} value={t}>{t}</option>)}
                            <option value="CUSTOM">-- JUDUL CUSTOM --</option>
                        </select>
                        {title === "CUSTOM" && (
                            <input 
                                type="text"
                                placeholder="Masukkan judul administrasi..."
                                value={customTitle}
                                onChange={(e) => setCustomTitle(e.target.value)}
                                className="mt-2 w-full p-2 border rounded-md"
                            />
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">URL Logo (Ubah jika perlu)</label>
                        <input 
                            type="text"
                            value={logoUrl}
                            onChange={(e) => setLogoUrl(e.target.value)}
                            className="w-full p-2 border rounded-md text-sm"
                        />
                        <p className="text-xs text-gray-500 mt-1 italic">Pastikan link gambar mendukung CORS agar bisa diproses ke PDF.</p>
                    </div>

                    <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
                        <div className="flex items-center">
                            <input 
                                type="checkbox" 
                                id="includeSemester"
                                checked={includeSemester}
                                onChange={(e) => setIncludeSemester(e.target.checked)}
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                            />
                            <label htmlFor="includeSemester" className="ml-2 block text-sm text-gray-900 font-medium">
                                Cantumkan Semester
                            </label>
                        </div>
                        {includeSemester && (
                            <select 
                                value={semester}
                                onChange={(e) => setSemester(e.target.value)}
                                className="p-1 border rounded-md text-sm"
                            >
                                <option>1 (Ganjil)</option>
                                <option>2 (Genap)</option>
                            </select>
                        )}
                    </div>

                    <div className="space-y-3 p-4 border rounded-lg bg-indigo-50">
                        <h4 className="font-bold text-indigo-800 text-sm uppercase">Detail Identitas (Bisa Diedit)</h4>
                        <div className="grid grid-cols-1 gap-3">
                            <div>
                                <label className="text-xs font-bold text-indigo-600">NAMA</label>
                                <input type="text" value={details.name} onChange={e => setDetails({...details, name: e.target.value})} className="w-full p-1 border rounded text-sm" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-indigo-600">NIP</label>
                                <input type="text" value={details.nip} onChange={e => setDetails({...details, nip: e.target.value})} className="w-full p-1 border rounded text-sm" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-indigo-600">SEKOLAH</label>
                                <input type="text" value={details.school} onChange={e => setDetails({...details, school: e.target.value})} className="w-full p-1 border rounded text-sm" />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs font-bold text-indigo-600">KELAS</label>
                                    <input type="text" value={details.className} onChange={e => setDetails({...details, className: e.target.value})} className="w-full p-1 border rounded text-sm" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-indigo-600">FASE</label>
                                    <input type="text" value={details.phase} onChange={e => setDetails({...details, phase: e.target.value})} className="w-full p-1 border rounded text-sm" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-indigo-600">TAHUN AJARAN</label>
                                <input type="text" value={details.academicYear} onChange={e => setDetails({...details, academicYear: e.target.value})} className="w-full p-1 border rounded text-sm" />
                            </div>
                        </div>
                    </div>

                    <button 
                        onClick={handleDownload}
                        disabled={isGenerating}
                        className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg flex items-center justify-center space-x-2 transition-all transform active:scale-95 disabled:bg-gray-400"
                    >
                        {isGenerating ? (
                            <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : <ArrowDownTrayIcon className="w-5 h-5" />}
                        <span>{isGenerating ? "MENGOLAH PDF..." : "DOWNLOAD COVER (PDF F4)"}</span>
                    </button>
                </div>

                {/* Preview Area */}
                <div className="hidden md:block border-2 border-dashed border-gray-300 rounded-xl p-4 bg-gray-50 relative overflow-hidden">
                    <div className="absolute top-2 left-2 text-[10px] font-bold text-gray-400 uppercase">Preview Layout (Simulasi)</div>
                    <div className="bg-white w-full aspect-[215/330] shadow-md border border-gray-200 p-8 flex flex-col items-center text-center">
                        <div className="w-full h-full border-2 border-black p-2">
                            <div className="w-full h-full border border-black flex flex-col items-center pt-8">
                                <h3 className="font-bold text-lg leading-tight uppercase mb-12">
                                    {(customTitle || title).split('\n').map((line, i) => <div key={i}>{line}</div>)}
                                </h3>
                                
                                <div className="w-24 h-24 bg-gray-100 border flex items-center justify-center mb-16">
                                    <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                                </div>

                                <div className="mt-auto mb-12 w-full px-8 text-left space-y-2 text-[10px]">
                                    <div className="flex"><span className="w-20 font-bold">NAMA</span><span className="mr-2">:</span><span>{details.name}</span></div>
                                    <div className="flex"><span className="w-20 font-bold">NIP</span><span className="mr-2">:</span><span>{details.nip}</span></div>
                                    <div className="flex"><span className="w-20 font-bold">SEKOLAH</span><span className="mr-2">:</span><span>{details.school}</span></div>
                                    <div className="flex"><span className="w-20 font-bold">KELAS</span><span className="mr-2">:</span><span>{details.className.replace('Kelas ', '')}</span></div>
                                    <div className="flex"><span className="w-20 font-bold">FASE</span><span className="mr-2">:</span><span>{details.phase}</span></div>
                                    {includeSemester && <div className="flex"><span className="w-20 font-bold">SEMESTER</span><span className="mr-2">:</span><span>{semester}</span></div>}
                                    <div className="flex"><span className="w-20 font-bold">TAHUN AJARAN</span><span className="mr-2">:</span><span>{details.academicYear}</span></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CoverGenerator;
