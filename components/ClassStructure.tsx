
import React, { useState, useEffect, useMemo } from 'react';
import { ClassStructure, Student, Teacher, SchoolIdentity } from '../types';
import { getClassStructure, updateClassStructure, getStudents, getTeacherProfile, getSchoolIdentity } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { PencilIcon, TrashIcon, ArrowDownTrayIcon, UserPlusIcon } from './Icons';
import AutocompleteInput from './AutocompleteInput';

declare const jspdf: any;

interface ClassStructureProps {
    selectedClass: string;
    selectedYear: string;
    userId?: string;
}

const RoleBox = ({ title, name }: { title: string; name?: string }) => (
    <div className="border border-black rounded-full px-5 py-2 bg-white shadow text-center shrink-0 min-w-[160px] flex flex-col justify-center">
      <div className="font-bold text-sm">{title}</div>
      {name ? (
        <div className="text-gray-700 text-xs mt-1 truncate" title={name}>{name}</div>
      ) : null}
    </div>
);

const SectionBox = ({ title, members }: { title: string; members: string[] }) => (
    <div className="border border-black rounded-lg px-4 py-2 bg-white shadow text-center shrink-0 w-[180px] min-h-[80px] flex flex-col justify-center">
        <div className="font-bold text-sm break-words">{title}</div>
        {members.length > 0 ? (
            <ul className="text-gray-700 text-xs mt-1 list-disc list-inside text-left">
                {members.map((name, i) => <li key={i} className="truncate" title={name}>{name}</li>)}
            </ul>
        ) : (
            <div className="text-gray-500 text-xs mt-1 italic">Belum ada anggota</div>
        )}
    </div>
);


const VLine = ({ height = 'h-6' }) => <div className={`w-px ${height} bg-black mx-auto`} />;

const ClassStructureComponent: React.FC<ClassStructureProps> = ({ selectedClass, selectedYear, userId }) => {
    const [structure, setStructure] = useState<ClassStructure | null>(null);
    const [students, setStudents] = useState<Student[]>([]);
    const [teacher, setTeacher] = useState<Teacher | null>(null);
    const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity | null>(null);
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
            try {
                const [structureData, studentData, teacherData, identityData] = await Promise.all([
                    getClassStructure(selectedYear, selectedClass, userId),
                    getStudents(selectedYear, selectedClass, userId),
                    getTeacherProfile(selectedYear, selectedClass, userId),
                    getSchoolIdentity(userId),
                ]);
                setStructure(structureData);
                setStudents(studentData.filter(s => s.fullName)); // Filter out empty student rows
                setTeacher(teacherData);
                setSchoolIdentity(identityData);
            } catch (error: any) {
                setNotification({ message: error.message || 'Gagal memuat data.', type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [selectedClass, selectedYear, userId, isEditing]); // Refetch when editing is cancelled
    
    const assignedNames = useMemo(() => {
        if (!structure) return new Set<string>();
        
        const names = new Set<string>();
        if (structure.president) names.add(structure.president);
        if (structure.vicePresident) names.add(structure.vicePresident);
        if (structure.secretary1) names.add(structure.secretary1);
        if (structure.secretary2) names.add(structure.secretary2);
        if (structure.treasurer1) names.add(structure.treasurer1);
        if (structure.treasurer2) names.add(structure.treasurer2);
        
        structure.sections.forEach(sec => {
            sec.members.forEach(mem => {
                if (mem.name) names.add(mem.name);
            });
        });
        
        return names;
    }, [structure]);

    const studentNames = useMemo(() => students.map(s => s.fullName).sort(), [students]);

    const availableStudents = useMemo(() => {
        return studentNames.filter(name => !assignedNames.has(name));
    }, [studentNames, assignedNames]);

    const getOptionsForField = (currentValue: string) => {
        if (currentValue && !availableStudents.includes(currentValue)) {
            return [currentValue, ...availableStudents].sort();
        }
        return availableStudents;
    };


    const handleMainRoleChange = (name: keyof Omit<ClassStructure, 'sections'>, value: string) => {
        if (!structure) return;
        setStructure({ ...structure, [name]: value });
    };

    const handleSectionNameChange = (sectionId: string, newName: string) => {
        if (!structure) return;
        const updatedSections = structure.sections.map(sec => 
            sec.id === sectionId ? { ...sec, name: newName } : sec
        );
        setStructure({ ...structure, sections: updatedSections });
    };

    const handleAddSection = () => {
        if (!structure) return;
        const newSection = { id: crypto.randomUUID(), name: 'Seksi Baru', members: [] };
        setStructure({ ...structure, sections: [...structure.sections, newSection] });
    };
    
    const handleRemoveSection = (sectionId: string) => {
        if (!structure) return;
        const updatedSections = structure.sections.filter(sec => sec.id !== sectionId);
        setStructure({ ...structure, sections: updatedSections });
    };

    const handleAddMember = (sectionId: string) => {
        if (!structure) return;
        const newMember = { id: crypto.randomUUID(), name: '' };
        const updatedSections = structure.sections.map(sec => 
            sec.id === sectionId ? { ...sec, members: [...sec.members, newMember] } : sec
        );
        setStructure({ ...structure, sections: updatedSections });
    };

    const handleMemberNameChange = (sectionId: string, memberId: string, newName: string) => {
        if (!structure) return;
        const updatedSections = structure.sections.map(sec => {
            if (sec.id === sectionId) {
                const updatedMembers = sec.members.map(mem => 
                    mem.id === memberId ? { ...mem, name: newName } : mem
                );
                return { ...sec, members: updatedMembers };
            }
            return sec;
        });
        setStructure({ ...structure, sections: updatedSections });
    };

    const handleRemoveMember = (sectionId: string, memberId: string) => {
        if (!structure) return;
        const updatedSections = structure.sections.map(sec => {
            if (sec.id === sectionId) {
                return { ...sec, members: sec.members.filter(mem => mem.id !== memberId) };
            }
            return sec;
        });
        setStructure({ ...structure, sections: updatedSections });
    };

    const handleSave = async () => {
        if (!structure) return;
        setIsSaving(true);
        setNotification(null);
        try {
            await updateClassStructure(selectedYear, selectedClass, structure, userId);
            setNotification({ message: 'Struktur kelas berhasil disimpan.', type: 'success' });
            setIsEditing(false);
        } catch (error: any) {
             setNotification({ message: error.message || 'Gagal menyimpan data.', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDownloadPDF = async (signatureOption: 'none' | 'teacher' | 'both') => {
        setIsGeneratingPDF(true);
        setIsPdfDropdownOpen(false);
        setNotification({ message: 'Mempersiapkan PDF, mohon tunggu...', type: 'info' });
        await new Promise(resolve => setTimeout(resolve, 50));
    
        if (!structure || !schoolIdentity || !teacher) {
            setNotification({ message: 'Gagal membuat PDF: Data tidak lengkap.', type: 'error' });
            setIsGeneratingPDF(false);
            return;
        }
    
        try {
            const { jsPDF } = jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [215, 330] });
    
            // Define margins and dimensions
            const leftMargin = 20;
            const topMargin = 10;
            const rightMargin = 10;
            const bottomMargin = 10;
            const contentWidth = 215 - leftMargin - rightMargin;
            const centerX = leftMargin + contentWidth / 2;
            let y = topMargin;
    
            // --- PDF Helper Functions ---
            const drawRoleBox = (cx: number, cy: number, width: number, height: number, title: string, name: string) => {
                pdf.setDrawColor(0);
                pdf.setFillColor(255, 255, 255);
                pdf.roundedRect(cx - width / 2, cy, width, height, 5, 5, 'FD');
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(9);
            
                if (name) {
                    // Two lines: title and name
                    pdf.text(title, cx, cy + height / 2 - 1, { align: 'center' });
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(8);
                    const truncatedName = pdf.splitTextToSize(name, width - 6);
                    pdf.text(truncatedName, cx, cy + height / 2 + 3, { align: 'center' });
                } else {
                    // One line: just the title, vertically centered
                    pdf.text(title, cx, cy + height / 2, { align: 'center', baseline: 'middle' });
                }
            };
    
            const drawSectionBox = (cx: number, cy: number, width: number, height: number, title: string, members: string[]) => {
                pdf.setDrawColor(0);
                pdf.setFillColor(255, 255, 255);
                pdf.roundedRect(cx - width / 2, cy, width, height, 3, 3, 'FD');
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(9);
                pdf.text(title, cx, cy + 5, { align: 'center' });
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(7);
                if (members.length > 0) {
                    members.forEach((member, i) => {
                        const memberText = `- ${member}`;
                        const truncatedMember = pdf.splitTextToSize(memberText, width - 4);
                        pdf.text(truncatedMember, cx - width / 2 + 4, cy + 10 + (i * 4));
                    });
                } else {
                    pdf.setFont('helvetica', 'italic');
                    pdf.setTextColor(128);
                    pdf.text('Belum ada anggota', cx, cy + 12, { align: 'center' });
                    pdf.setTextColor(0);
                }
            };
    
            // --- 1. Draw Header ---
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.text(`STRUKTUR ORGANISASI ${selectedClass.toUpperCase()}`, 107.5, y + 5, { align: 'center' });
            y += 7;
            pdf.setFontSize(12);
            pdf.text(schoolIdentity.schoolName.toUpperCase(), 107.5, y + 5, { align: 'center' });
            y += 6;
            pdf.text(`TAHUN AJARAN ${selectedYear}`, 107.5, y + 5, { align: 'center' });
            y += 15;
    
            // --- 2. Draw Diagram ---
            const boxWidth = 50;
            const boxHeight = 16;
            const vSpace = 8;
    
            let currentY = y;
            drawRoleBox(centerX, currentY, boxWidth, boxHeight, 'Wali Kelas', teacher.fullName);
            currentY += boxHeight;
            pdf.line(centerX, currentY, centerX, currentY + vSpace);
            currentY += vSpace;
    
            drawRoleBox(centerX, currentY, boxWidth, boxHeight, 'Ketua Kelas', structure.president);
            currentY += boxHeight;
            pdf.line(centerX, currentY, centerX, currentY + vSpace);
            currentY += vSpace;
            
            drawRoleBox(centerX, currentY, boxWidth, boxHeight, 'Wakil Ketua Kelas', structure.vicePresident);
            currentY += boxHeight;
    
            // Connector to middle section
            pdf.line(centerX, currentY, centerX, currentY + vSpace / 2);
            const middleBranchY = currentY + vSpace / 2;
            const secretaryX = centerX - 45;
            const treasurerX = centerX + 45;
            pdf.line(secretaryX, middleBranchY, treasurerX, middleBranchY);
            pdf.line(secretaryX, middleBranchY, secretaryX, middleBranchY + vSpace / 2);
            pdf.line(treasurerX, middleBranchY, treasurerX, middleBranchY + vSpace / 2);
            currentY += vSpace;
    
            // Middle Section
            const middleSectionY = currentY;
            drawRoleBox(secretaryX, middleSectionY, boxWidth, boxHeight, 'Sekertaris 1', structure.secretary1);
            pdf.line(secretaryX, middleSectionY + boxHeight, secretaryX, middleSectionY + boxHeight + vSpace);
            drawRoleBox(secretaryX, middleSectionY + boxHeight + vSpace, boxWidth, boxHeight, 'Sekertaris 2', structure.secretary2);
    
            drawRoleBox(treasurerX, middleSectionY, boxWidth, boxHeight, 'Bendahara 1', structure.treasurer1);
            pdf.line(treasurerX, middleSectionY + boxHeight, treasurerX, middleSectionY + boxHeight + vSpace);
            drawRoleBox(treasurerX, middleSectionY + boxHeight + vSpace, boxWidth, boxHeight, 'Bendahara 2', structure.treasurer2);
            
            currentY = middleSectionY + (boxHeight * 2) + vSpace;
    
            // Connector to Seksi
            const bottomConnectorY = currentY + vSpace;
            pdf.line(secretaryX, currentY, secretaryX, bottomConnectorY);
            pdf.line(treasurerX, currentY, treasurerX, bottomConnectorY);
            pdf.line(secretaryX, bottomConnectorY, treasurerX, bottomConnectorY);
            pdf.line(centerX, bottomConnectorY, centerX, bottomConnectorY + vSpace / 2);
            currentY = bottomConnectorY + vSpace / 2;
    
            drawRoleBox(centerX, currentY, boxWidth, boxHeight, 'Seksi-Seksi', '');
            currentY += boxHeight;
    
            // Sections
            if (structure.sections.length > 0) {
                const vSpaceForSection = 8;
                const initialY = currentY; 
            
                const secBoxWidth = 42;
                const secBoxHeight = 25;
                const secGap = 4;
                const sectionsPerRow = 4;
                const numRows = Math.ceil(structure.sections.length / sectionsPerRow);
                const rowHeight = secBoxHeight + vSpaceForSection + 5;
            
                const firstBusY = initialY + vSpaceForSection;
                const lastBusY = firstBusY + (numRows > 1 ? (numRows - 1) * rowHeight : 0);
            
                pdf.line(centerX, initialY, centerX, lastBusY);
            
                for (let i = 0; i < numRows; i++) {
                    const busY = firstBusY + i * rowHeight;
                    
                    const sectionsInThisRow = structure.sections.slice(i * sectionsPerRow, (i + 1) * sectionsPerRow);
                    const totalWidth = sectionsInThisRow.length * secBoxWidth + (sectionsInThisRow.length - 1) * secGap;
                    const startX = centerX - totalWidth / 2;
            
                    if (sectionsInThisRow.length > 1) {
                        const firstRiserX = startX + secBoxWidth / 2;
                        const lastRiserX = startX + totalWidth - secBoxWidth / 2;
                        pdf.line(firstRiserX, busY, lastRiserX, busY);
                    }
            
                    sectionsInThisRow.forEach((section, index) => {
                        const secX = startX + index * (secBoxWidth + secGap) + secBoxWidth / 2;
                        pdf.line(secX, busY, secX, busY + vSpaceForSection / 2);
                        drawSectionBox(secX, busY + vSpaceForSection / 2, secBoxWidth, secBoxHeight, section.name, section.members.map(m => m.name));
                    });
                }
                
                currentY = lastBusY + vSpaceForSection / 2 + secBoxHeight + 10;
            }
    
            // --- 3. Draw Signatures ---
            if (signatureOption !== 'none') {
                const signatureY = 330 - bottomMargin - 40;
                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'normal');
                const formattedDate = new Date(signatureDate + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    
                if (signatureOption === 'both') {
                    const principalX = leftMargin + 40;
                    pdf.text('Mengetahui,', principalX, signatureY, { align: 'center' });
                    pdf.text('Kepala Sekolah', principalX, signatureY + 5, { align: 'center' });
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(schoolIdentity.principalName, principalX, signatureY + 25, { align: 'center' });
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${schoolIdentity.principalNip}`, principalX, signatureY + 30, { align: 'center' });
                }
    
                if (signatureOption === 'teacher' || signatureOption === 'both') {
                    const teacherX = 215 - rightMargin - 40;
                    pdf.text(`${schoolIdentity.city}, ${formattedDate}`, teacherX, signatureY, { align: 'center' });
                    pdf.text(`Wali Kelas`, teacherX, signatureY + 5, { align: 'center' });
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(teacher.fullName, teacherX, signatureY + 25, { align: 'center' });
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${teacher.nip}`, teacherX, signatureY + 30, { align: 'center' });
                }
            }
    
            // --- 4. Save PDF ---
            const fileName = `Struktur-Organisasi-${selectedClass.replace(' ', '_')}-${selectedYear.replace('/', '-')}.pdf`;
            pdf.save(fileName);
            setNotification({ message: `PDF berhasil dibuat: ${fileName}`, type: 'success' });
    
        } catch (error) {
            console.error(error);
            setNotification({ message: 'Terjadi kesalahan saat membuat PDF.', type: 'error' });
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    if (isLoading) return <div className="text-center p-8">Memuat data struktur kelas...</div>;
    if (!structure || !teacher || !schoolIdentity) return <div className="text-center p-8 text-red-500">Gagal memuat data penting.</div>;
    
    const renderAutocompleteField = (name: keyof Omit<ClassStructure, 'sections'>, label: string) => {
        if (!structure) return null;

        const value = structure[name] as string;

        return (
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <AutocompleteInput
                    value={value || ''}
                    onChange={(newValue) => handleMainRoleChange(name, newValue)}
                    onSelect={(selectedValue) => handleMainRoleChange(name, selectedValue)}
                    options={getOptionsForField(value)}
                    placeholder={`Nama ${label.toLowerCase()}`}
                    className="w-full text-sm"
                />
            </div>
        );
    };

    const renderDiagram = () => (
        <div className="font-sans">
            <div className="flex flex-col items-center p-4">
                {/* Top of Hierarchy */}
                <RoleBox title="Wali Kelas" name={teacher?.fullName} />
                <VLine />
                <RoleBox title="Ketua Kelas" name={structure.president} />
                <VLine />
                <RoleBox title="Wakil Ketua Kelas" name={structure.vicePresident} />

                {/* Branching Connector to Middle Section */}
                <div className="w-full max-w-lg h-8 relative">
                    <div className="absolute top-0 left-1/2 w-px h-4 bg-black -translate-x-1/2"></div>
                    <div className="absolute top-4 left-1/4 w-1/2 h-px bg-black"></div>
                    <div className="absolute top-4 left-1/4 w-px h-4 bg-black"></div>
                    <div className="absolute top-4 right-1/4 w-px h-4 bg-black -translate-x-1/2"></div>
                </div>

                {/* Middle Section: Sekretaris & Bendahara */}
                <div className="flex w-full max-w-lg justify-around">
                    <div className="flex flex-col items-center">
                        <RoleBox title="Sekertaris 1" name={structure.secretary1} />
                        <VLine />
                        <RoleBox title="Sekertaris 2" name={structure.secretary2} />
                    </div>
                    <div className="flex flex-col items-center">
                        <RoleBox title="Bendahara 1" name={structure.treasurer1} />
                        <VLine />
                        <RoleBox title="Bendahara 2" name={structure.treasurer2} />
                    </div>
                </div>

                {/* Converging Connector to Bottom Section */}
                <div className="w-full max-w-lg h-8 relative">
                    <div className="absolute top-0 left-1/4 w-px h-4 bg-black"></div>
                    <div className="absolute top-0 right-1/4 w-px h-4 bg-black -translate-x-1/2"></div>
                    <div className="absolute top-4 left-1/4 w-1/2 h-px bg-black"></div>
                    <div className="absolute top-4 left-1/2 w-px h-4 bg-black -translate-x-1/2"></div>
                </div>
                
                <RoleBox title="Seksi-Seksi" />
                
                {/* Connector to Sections */}
                {structure.sections.length > 0 && (
                    <div className="w-full flex flex-col items-center">
                         {structure.sections.length === 1 ? (
                            <>
                                <VLine height="h-8" />
                                <SectionBox
                                    title={structure.sections[0].name}
                                    members={structure.sections[0].members.map(m => m.name).filter(Boolean)}
                                />
                            </>
                        ) : (
                            <div className="w-full overflow-x-auto pb-4 flex justify-center">
                                <div className="relative inline-flex flex-col items-center">
                                    <div className="w-px h-8 bg-black"></div>
                                    <div className="relative">
                                        <div className="absolute top-0 h-px bg-black" style={{
                                            left: `calc( (100% / ${structure.sections.length}) / 2 )`,
                                            right: `calc( (100% / ${structure.sections.length}) / 2 )`
                                        }}></div>
                                        <div className="flex justify-center">
                                            {structure.sections.map((section) => (
                                                <div key={section.id} className="relative flex flex-col items-center flex-shrink-0 px-4 pt-8">
                                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-8 bg-black"></div>
                                                    <SectionBox
                                                        title={section.name}
                                                        members={structure.sections.length > 5 ? section.members.slice(0, 2).map(m => m.name).filter(Boolean) : section.members.map(m => m.name).filter(Boolean)}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg">
            <style>{`.input-style { padding: 0.5rem 0.75rem; border: 1px solid #D1D5DB; border-radius: 0.375rem; } .input-style:focus { outline: none; --tw-ring-color: #4f46e5; box-shadow: 0 0 0 1px var(--tw-ring-color); border-color: #6366F1;}`}</style>
            
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            
            <div className="flex justify-end items-center mb-4 space-x-2">
                 {isEditing ? (
                    <>
                        <button onClick={() => setIsEditing(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold">Batal</button>
                        <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold disabled:bg-indigo-400">{isSaving ? 'Menyimpan...' : 'Simpan'}</button>
                    </>
                ) : (
                    <>
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
                                    className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border"
                                    onMouseLeave={() => setIsPdfDropdownOpen(false)}
                                >
                                    <ul className="py-1">
                                        <li><button onClick={() => handleDownloadPDF('none')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Tanpa TTD</button></li>
                                        <li><button onClick={() => handleDownloadPDF('teacher')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">TTD Wali Kelas</button></li>
                                        <li><button onClick={() => handleDownloadPDF('both')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">TTD Wali Kelas & KS</button></li>
                                    </ul>
                                </div>
                            )}
                        </div>
                        <button onClick={() => setIsEditing(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold shadow flex items-center space-x-2"><PencilIcon /> <span>Edit</span></button>
                    </>
                )}
            </div>

            <div className="border-t pt-4">
                 {!isEditing ? (
                    <div className="bg-white px-2 pt-2">
                        <div className="text-center w-full mb-4">
                            <h2 className="text-xl font-bold text-gray-800">STRUKTUR ORGANISASI {selectedClass.toUpperCase()}</h2>
                            <p className="text-lg font-semibold text-gray-700 mt-1">{schoolIdentity.schoolName.toUpperCase()}</p>
                            <p className="text-md text-gray-600">TAHUN AJARAN {selectedYear}</p>
                        </div>
                        {renderDiagram()}
                    </div>
                ) : (
                    <div className="space-y-8">
                        <div className="p-6 border rounded-lg">
                            <h3 className="text-lg font-semibold text-gray-700 mb-4">Badan Pengurus Harian</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {renderAutocompleteField('president', 'Ketua Kelas')}
                                {renderAutocompleteField('vicePresident', 'Wakil Ketua Kelas')}
                                {renderAutocompleteField('secretary1', 'Sekretaris I')}
                                {renderAutocompleteField('secretary2', 'Sekretaris II')}
                                {renderAutocompleteField('treasurer1', 'Bendahara I')}
                                {renderAutocompleteField('treasurer2', 'Bendahara II')}
                            </div>
                        </div>
                        
                        <div>
                            <h3 className="text-lg font-semibold text-gray-700 mb-4">Seksi-Seksi</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {structure.sections.map(sec => (
                                    <div key={sec.id} className="p-4 border rounded-lg h-full flex flex-col">
                                        <div className="flex items-center mb-2">
                                            <input type="text" value={sec.name} onChange={(e) => handleSectionNameChange(sec.id, e.target.value)} className="font-bold text-md text-indigo-700 border-b-2 border-indigo-200 focus:outline-none focus:border-indigo-500 flex-grow" />
                                            <button onClick={() => handleRemoveSection(sec.id)} className="ml-2 text-red-500 hover:text-red-500 p-1"><TrashIcon className="w-4 h-4" /></button>
                                        </div>
                                        <div className="flex-grow">
                                            <div className="space-y-2">
                                                {sec.members.map(mem => (
                                                    <div key={mem.id} className="flex items-center">
                                                        <AutocompleteInput
                                                            value={mem.name}
                                                            onChange={(newValue) => handleMemberNameChange(sec.id, mem.id, newValue)}
                                                            onSelect={(selectedValue) => handleMemberNameChange(sec.id, mem.id, selectedValue)}
                                                            options={getOptionsForField(mem.name)}
                                                            placeholder="Nama anggota"
                                                            className="w-full text-sm"
                                                        />
                                                        <button onClick={() => handleRemoveMember(sec.id, mem.id)} className="ml-2 text-red-500 hover:text-red-700 p-1"><TrashIcon className="w-4 h-4"/></button>
                                                    </div>
                                                ))}
                                                <button onClick={() => handleAddMember(sec.id)} className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 font-semibold flex items-center space-x-1">
                                                    <UserPlusIcon className="w-4 h-4"/> <span>Tambah Anggota</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <div className="p-4 border-2 border-dashed rounded-lg flex items-center justify-center">
                                    <button onClick={handleAddSection} className="text-indigo-600 hover:text-indigo-800 font-semibold">
                                        + Tambah Seksi Baru
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ClassStructureComponent;
