
import React, { useState, useEffect, useMemo } from 'react';
import { Student, SeatingConfig, SeatingChartData, Teacher, SchoolIdentity } from '../types';
import { getStudents, getSeatingChart, updateSeatingChart, getSchoolIdentity, getTeacherProfile } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { PencilIcon, SparklesIcon, ArrowDownTrayIcon } from './Icons';
import AutocompleteInput from './AutocompleteInput';

declare const jspdf: any;

interface SeatingChartProps {
    selectedClass: string;
    selectedYear: string;
    userId?: string;
}

interface UIData extends SeatingChartData {
    totalStudents: number;
}

const Chair: React.FC<{ studentName?: string }> = ({ studentName }) => (
    <div className="w-6 h-6 bg-blue-200 border-2 border-blue-400 rounded-t-lg rounded-b-sm" title={studentName}>
        {/* Chair back */}
    </div>
);

const Desk: React.FC<{
    studentsOnDesk: string[];
    studentsPerTable: number;
    isEditing: boolean;
    tableIndex: number;
    onStudentChange: (tableIndex: number, seatIndex: number, name: string) => void;
    getAvailableStudents: (currentValue: string) => string[];
}> = ({ studentsOnDesk, studentsPerTable, isEditing, tableIndex, onStudentChange, getAvailableStudents }) => {
    
    const deskWidthClass = studentsPerTable === 1 ? 'w-28' // 7rem
                           : studentsPerTable === 2 ? 'w-60' // 15rem
                           : 'w-full';

    return (
        <div className="flex flex-col items-center p-1">
            {/* Desk with names inside and divider */}
            <div className={`h-16 bg-amber-200 border-2 border-amber-400 rounded-md shadow-sm flex items-center justify-evenly px-1 ${deskWidthClass}`}>
                {Array.from({ length: studentsPerTable }).map((_, i) => {
                    const studentName = studentsOnDesk[i] || '';
                    return (
                        <React.Fragment key={i}>
                            <div className="flex-1 min-w-0">
                                {isEditing ? (
                                    <AutocompleteInput
                                        value={studentName}
                                        onChange={(newValue) => onStudentChange(tableIndex, i, newValue)}
                                        onSelect={(selectedValue) => onStudentChange(tableIndex, i, selectedValue)}
                                        options={getAvailableStudents(studentName)}
                                        placeholder="Nama Siswa"
                                        className="w-full text-xs"
                                    />
                                ) : (
                                    <div 
                                        className="text-xs font-semibold text-gray-800 truncate text-center h-full flex items-center justify-center px-1" 
                                        title={studentName}
                                    >
                                        {studentName}
                                    </div>
                                )}
                            </div>
                            {i < studentsPerTable - 1 && (
                                <div className="h-12 w-px bg-amber-500"></div>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
            {/* Chairs below */}
            <div className={`flex justify-around items-center mt-1 ${deskWidthClass}`}>
                {Array.from({ length: studentsPerTable }).map((_, i) => (
                    <Chair key={i} studentName={studentsOnDesk[i]} />
                ))}
            </div>
        </div>
    );
};


const SeatingChart: React.FC<SeatingChartProps> = ({ selectedClass, selectedYear, userId }) => {
    const [students, setStudents] = useState<Student[]>([]);
    const [teacher, setTeacher] = useState<Teacher | null>(null);
    const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity | null>(null);
    const [uiData, setUiData] = useState<UIData | null>(null);
    const [originalState, setOriginalState] = useState<UIData | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false); // For saving or randomizing
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);
    const [signatureDate, setSignatureDate] = useState(new Date().toISOString().split('T')[0]);
    const [isPdfDropdownOpen, setIsPdfDropdownOpen] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            setIsEditing(false);
            try {
                const [studentsData, chartData, teacherData, identityData] = await Promise.all([
                    getStudents(selectedYear, selectedClass, userId),
                    getSeatingChart(selectedYear, selectedClass, userId),
                    getTeacherProfile(selectedYear, selectedClass, userId),
                    getSchoolIdentity(userId)
                ]);
                // Filter: Hanya ambil baris yang punya nama lengkap
                const activeStudents = studentsData.filter(s => s.fullName && s.fullName.trim() !== '');
                setStudents(activeStudents);
                setTeacher(teacherData);
                setSchoolIdentity(identityData);

                // Ensure totalTables doesn't exceed max capacity
                const maxTables = chartData.config.tablesPerRow * chartData.config.tablesPerColumn;
                if (!chartData.config.totalTables || chartData.config.totalTables > maxTables) {
                    chartData.config.totalTables = maxTables;
                }

                setUiData({
                    ...chartData,
                    totalStudents: activeStudents.length,
                });
            } catch (error: any) {
                setNotification({ message: error.message || 'Gagal memuat data.', type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [selectedClass, selectedYear, userId]);

    // Logika Nama: Gunakan nickname jika ada, jika tidak gunakan fullName
    const studentNicknames = useMemo(() => 
        students.map(s => s.nickname && s.nickname.trim() !== '' ? s.nickname : s.fullName).sort()
    , [students]);

    const assignedStudents = useMemo(() => new Set(uiData?.arrangement.flat().filter(Boolean)), [uiData]);

    const getAvailableStudents = (currentValue: string): string[] => {
        const available = studentNicknames.filter(name => !assignedStudents.has(name));
        if (currentValue && !available.includes(currentValue)) {
            return [currentValue, ...available].sort();
        }
        return available;
    };

    const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        if (!uiData) return;
        const { name, value } = e.target;
        const keys = name.split('.');

        if (keys.length === 2 && keys[0] === 'config') {
            const configKey = keys[1];
            let numericValue = parseInt(value, 10);

            if (configKey === 'totalTables') {
                 const maxTables = uiData.config.tablesPerRow * uiData.config.tablesPerColumn;
                 if (numericValue > maxTables) numericValue = maxTables;
            }

            setUiData(prev => ({
                ...prev!,
                config: {
                    ...prev!.config,
                    [configKey]: numericValue || 0
                }
            }));
        } else {
             setUiData(prev => ({ ...prev!, [name]: value } as UIData));
        }
    };
    
    const handleRandomizeSeats = () => {
        if (!uiData) return;
        setIsProcessing(true);
        setNotification(null);
        
        setTimeout(() => {
            const shuffledStudents = [...students].sort(() => 0.5 - Math.random());
            const totalTables = uiData.config.totalTables;
            const newArrangement: string[][] = Array.from({ length: totalTables }, () => []);
            let studentIndex = 0;
            
            for (let i = 0; i < totalTables; i++) {
                for (let j = 0; j < uiData.config.studentsPerTable; j++) {
                    if (studentIndex < shuffledStudents.length) {
                        const s = shuffledStudents[studentIndex];
                        const name = s.nickname && s.nickname.trim() !== '' ? s.nickname : s.fullName;
                        newArrangement[i].push(name);
                        studentIndex++;
                    } else {
                        newArrangement[i].push('');
                    }
                }
            }
            
            setUiData(prev => ({...prev!, arrangement: newArrangement}));
            setIsProcessing(false);
            setNotification({ message: 'Siswa berhasil ditempatkan secara acak!', type: 'info' });
        }, 500);
    };
    
    const handleEdit = () => {
        setOriginalState(JSON.parse(JSON.stringify(uiData))); // Deep copy for restoration
        setIsEditing(true);
    };

    const handleCancel = () => {
        if(originalState) setUiData(originalState);
        setIsEditing(false);
        setOriginalState(null);
    };

    const handleSave = async () => {
        if (!uiData) return;
        setIsProcessing(true);
        setNotification(null);
    
        const { totalStudents, ...dataToSave } = uiData;

        const totalGridSlots = dataToSave.config.tablesPerRow * dataToSave.config.tablesPerColumn;
        const studentsPerTable = dataToSave.config.studentsPerTable;
        const sanitizedArrangement: string[][] = [];
        for (let i = 0; i < totalGridSlots; i++) {
            const table = dataToSave.arrangement[i] || [];
            const sanitizedTable: string[] = [];
            for (let j = 0; j < studentsPerTable; j++) {
                sanitizedTable.push(table[j] || '');
            }
            sanitizedArrangement.push(sanitizedTable);
        }
        dataToSave.arrangement = sanitizedArrangement;
    
        try {
            await updateSeatingChart(selectedYear, selectedClass, dataToSave, userId);
            setUiData(prev => ({...prev!, arrangement: sanitizedArrangement}));
            setNotification({ message: 'Denah berhasil disimpan.', type: 'success' });
            setIsEditing(false);
            setOriginalState(null);
        } catch (error: any) {
            setNotification({ message: error.message || 'Gagal menyimpan data denah tempat duduk.', type: 'error' });
        } finally {
            setIsProcessing(false);
        }
    };
    
    const handleStudentSeatChange = (tableIndex: number, seatIndex: number, newName: string) => {
        if (!uiData) return;
        setUiData(prev => {
            const newArrangement = prev!.arrangement.map(arr => [...(arr || [])]); // Deep copy
            if (!newArrangement[tableIndex]) {
                newArrangement[tableIndex] = [];
            }
            newArrangement[tableIndex][seatIndex] = newName;
            return { ...prev!, arrangement: newArrangement };
        });
    };
    
    const gridToTableMap = useMemo(() => {
        if (!uiData) return new Map<number, number>();
        const { tablesPerRow, totalTables } = uiData.config;
        const { lastRowPosition, lastRowSubPosition } = uiData;

        const map = new Map<number, number>();
        if (totalTables === 0) return map;

        const numFullRows = Math.floor((totalTables - 1) / tablesPerRow);
        const tablesInLastRow = totalTables % tablesPerRow === 0 ? (totalTables > 0 ? tablesPerRow : 0) : totalTables % tablesPerRow;
        
        for (let i = 0; i < numFullRows * tablesPerRow; i++) {
            map.set(i, i);
        }

        if (tablesInLastRow > 0) {
            let startCol = 0;
            const emptyCols = tablesPerRow - tablesInLastRow;
            switch (lastRowPosition) {
                case 'right':
                    startCol = emptyCols;
                    break;
                case 'center':
                    startCol = lastRowSubPosition === 'right' ? Math.ceil(emptyCols / 2) : Math.floor(emptyCols / 2);
                    break;
                case 'left':
                default:
                    startCol = 0;
                    break;
            }

            const lastRowStartGridIndex = numFullRows * tablesPerRow + startCol;
            for (let i = 0; i < tablesInLastRow; i++) {
                map.set(lastRowStartGridIndex + i, numFullRows * tablesPerRow + i);
            }
        }
        
        return map;

    }, [uiData]);

    const handleDownloadPDF = async (signatureOption: 'none' | 'teacher' | 'both') => {
        setIsPdfDropdownOpen(false);
        setIsProcessing(true);
        setNotification({ message: 'Mempersiapkan PDF...', type: 'info' });
        await new Promise(resolve => setTimeout(resolve, 50));
    
        if (!schoolIdentity || !teacher || !uiData) {
            setNotification({ message: 'Gagal mendapatkan data sekolah/guru untuk PDF.', type: 'error' });
            setIsProcessing(false);
            return;
        }
    
        try {
            const { jsPDF } = jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [215, 330] }); // F4 Portrait
    
            const margin = { top: 15, left: 25, right: 10, bottom: 20 };
            const pageWidth = 215;
            const pageHeight = 330;
            const contentWidth = pageWidth - margin.left - margin.right;
            const contentHeight = pageHeight - margin.top - margin.bottom;
            let y = margin.top;
    
            // Header
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.text(`DENAH TEMPAT DUDUK ${selectedClass.toUpperCase()}`, pageWidth / 2, y, { align: 'center' });
            y += 7;
            pdf.setFontSize(12);
            pdf.text(schoolIdentity.schoolName.toUpperCase(), pageWidth / 2, y, { align: 'center' });
            y += 6;
            pdf.text(`TAHUN AJARAN ${selectedYear}`, pageWidth / 2, y, { align: 'center' });
            y += 10;
    
            // Classroom Walls
            const classroomTop = y;
            const classroomLeft = margin.left;
            const signatureAreaHeight = 50;
            const classroomHeight = contentHeight - (classroomTop - margin.top) - signatureAreaHeight;
            pdf.setDrawColor(156, 163, 175);
            pdf.setLineWidth(0.5);
            pdf.rect(classroomLeft, classroomTop, contentWidth, classroomHeight);
            
            // Whiteboard
            const whiteboardWidth = contentWidth * 0.5;
            const whiteboardHeight = 5;
            const whiteboardX = classroomLeft + (contentWidth - whiteboardWidth) / 2;
            pdf.setFillColor(255, 255, 255);
            pdf.setDrawColor(0, 0, 0);
            pdf.setLineWidth(0.2);
            pdf.roundedRect(whiteboardX, classroomTop, whiteboardWidth, whiteboardHeight, 1, 1, 'FD');
            pdf.setFontSize(7);
            pdf.setFont('helvetica', 'bold');
            pdf.text('PAPAN TULIS', whiteboardX + whiteboardWidth / 2, classroomTop + whiteboardHeight / 2, { align: 'center', baseline: 'middle' });
            
            // Teacher's Area
            let currentDrawingY = classroomTop + 15;
            const teacherDeskWidth = 25;
            const teacherDeskHeight = 12;
            const teacherChairSize = 7;
            const teacherDeskCols = uiData.config.tablesPerRow;
            const teacherDeskColWidth = contentWidth / teacherDeskCols;
            let teacherDeskX;
    
            switch (uiData.teacherDeskPosition) {
                case 'front-left': teacherDeskX = classroomLeft + (teacherDeskColWidth / 2) - (teacherDeskWidth / 2); break;
                case 'front-right': teacherDeskX = classroomLeft + contentWidth - (teacherDeskColWidth / 2) - (teacherDeskWidth / 2); break;
                default: teacherDeskX = classroomLeft + (contentWidth / 2) - (teacherDeskWidth / 2); break;
            }
            
            pdf.setFillColor(209, 213, 219);
            pdf.setDrawColor(107, 114, 128);
            pdf.roundedRect(teacherDeskX + (teacherDeskWidth - teacherChairSize) / 2, currentDrawingY - (teacherChairSize / 2), teacherChairSize, teacherChairSize, 2, 2, 'FD');

            pdf.setFillColor(217, 119, 6);
            pdf.setDrawColor(146, 64, 14);
            pdf.roundedRect(teacherDeskX, currentDrawingY, teacherDeskWidth, teacherDeskHeight, 2, 2, 'FD');
            pdf.setFontSize(7);
            pdf.setFont('helvetica', 'bold');
            pdf.text('MEJA GURU', teacherDeskX + teacherDeskWidth / 2, currentDrawingY + teacherDeskHeight / 2, { align: 'center', baseline: 'middle' });
    
            currentDrawingY += teacherDeskHeight; 
    
            // Student Desks Area
            const { tablesPerRow, tablesPerColumn, studentsPerTable } = uiData.config;
            const drawingAreaHeight = classroomHeight - (currentDrawingY - classroomTop) - 10;
            const colWidth = contentWidth / tablesPerRow;
            
            const fixedDeskHeight = 12;
            const fixedChairSize = 6;
            const fixedDeskChairGap = 1;
            const deskUnitHeight = fixedDeskHeight + fixedDeskChairGap + fixedChairSize;

            const maxTeacherStudentGap = 1 * deskUnitHeight;
            const maxStudentGap = 1 * deskUnitHeight;
            const newMaxBackWallGap = 4 * deskUnitHeight;

            const totalDeskUnitsHeight = tablesPerColumn * deskUnitHeight;
            const totalSpacingBudget = drawingAreaHeight - totalDeskUnitsHeight;
            
            let frontPadding, actualVerticalGap, backPadding;

            if (totalSpacingBudget < 0) {
                frontPadding = 0; actualVerticalGap = 0; backPadding = 0;
            } else {
                const numStudentGaps = Math.max(0, tablesPerColumn - 1);
                const numSpaces = 1 + numStudentGaps + 1;
                const idealSpace = numSpaces > 0 ? totalSpacingBudget / numSpaces : totalSpacingBudget;
                frontPadding = Math.min(idealSpace, maxTeacherStudentGap);
                actualVerticalGap = Math.min(idealSpace, maxStudentGap);
                backPadding = Math.min(idealSpace, newMaxBackWallGap);
                let usedSpace = frontPadding + (numStudentGaps * actualVerticalGap) + backPadding;
                let surplus = totalSpacingBudget - usedSpace;
                if (surplus > 0) {
                    let spaceToAdd = Math.min(surplus, newMaxBackWallGap - backPadding);
                    backPadding += spaceToAdd; surplus -= spaceToAdd;
                }
                if (surplus > 0) {
                    let spaceToAdd = Math.min(surplus, maxTeacherStudentGap - frontPadding);
                    frontPadding += spaceToAdd; surplus -= spaceToAdd;
                }
                if (surplus > 0 && numStudentGaps > 0) {
                    const perStudentGapRoom = maxStudentGap - actualVerticalGap;
                    const totalStudentGapRoom = numStudentGaps * perStudentGapRoom;
                    let spaceToAdd = Math.min(surplus, totalStudentGapRoom);
                    actualVerticalGap += numStudentGaps > 0 ? spaceToAdd / numStudentGaps : 0;
                    surplus -= spaceToAdd;
                }
                if (surplus > 0) backPadding += surplus;
            }

            const studentAreaStartY = currentDrawingY + frontPadding;
            const totalRowStep = deskUnitHeight + actualVerticalGap;
            const deskWidthRatio = studentsPerTable === 1 ? 0.4 : 0.8;
            const deskWidth = colWidth * deskWidthRatio;
    
            for (let gridRow = 0; gridRow < tablesPerColumn; gridRow++) {
                for (let gridCol = 0; gridCol < tablesPerRow; gridCol++) {
                    const gridIndex = gridRow * tablesPerRow + gridCol;
                    if (!gridToTableMap.has(gridIndex)) continue;
    
                    const tableIndex = gridToTableMap.get(gridIndex)!;
                    const deskX = classroomLeft + (gridCol * colWidth) + (colWidth - deskWidth) / 2;
                    const deskY = studentAreaStartY + (gridRow * totalRowStep);
                    
                    pdf.setFillColor(254, 243, 199);
                    pdf.setDrawColor(252, 211, 77);
                    pdf.roundedRect(deskX, deskY, deskWidth, fixedDeskHeight, 1, 1, 'FD');
                    
                    const studentsOnDesk = uiData.arrangement[tableIndex] || [];
                    const chairSpacing = deskWidth / studentsPerTable;
                    for (let seat = 0; seat < studentsPerTable; seat++) {
                        const chairX = deskX + (seat * chairSpacing) + (chairSpacing / 2) - (fixedChairSize / 2);
                        const chairY = deskY + fixedDeskHeight + fixedDeskChairGap;
                        pdf.setFillColor(191, 219, 254);
                        pdf.setDrawColor(96, 165, 250);
                        pdf.roundedRect(chairX, chairY, fixedChairSize, fixedChairSize, 2, 0.5, 'FD');
                    }

                    pdf.setFontSize(6);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setTextColor(0, 0, 0);

                    if (studentsPerTable > 1) {
                         pdf.setDrawColor(252, 211, 77);
                         pdf.line(deskX + deskWidth / 2, deskY, deskX + deskWidth / 2, deskY + fixedDeskHeight);
                    }

                    for (let seat = 0; seat < studentsPerTable; seat++) {
                        const studentName = studentsOnDesk[seat] || '';
                        if (studentName) {
                            const textX = deskX + (seat * chairSpacing) + (chairSpacing / 2);
                            pdf.text(studentName.toUpperCase(), textX , deskY + fixedDeskHeight/2, { align: 'center', baseline: 'middle', maxWidth: chairSpacing - 2 });
                        }
                    }
                }
            }
    
            // Signatures
            if (signatureOption !== 'none') {
                const signatureY = classroomTop + classroomHeight + 15;
                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'normal');
                const formattedDate = new Date(signatureDate + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
                const principalX = margin.left + (contentWidth / 4);
                const teacherX = margin.left + (contentWidth * 3 / 4);

                if (signatureOption === 'both') {
                    pdf.text('Mengetahui,', principalX, signatureY, { align: 'center' });
                    pdf.text('Kepala Sekolah', principalX, signatureY + 5, { align: 'center' });
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(schoolIdentity.principalName, principalX, signatureY + 25, { align: 'center' });
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${schoolIdentity.principalNip}`, principalX, signatureY + 30, { align: 'center' });
                }

                if (signatureOption === 'teacher' || signatureOption === 'both') {
                    pdf.text(`${schoolIdentity.city || '...................'}, ${formattedDate}`, teacherX, signatureY, { align: 'center' });
                    pdf.text(`Wali Kelas ${selectedClass.replace('Kelas ', '')}`, teacherX, signatureY + 5, { align: 'center' });
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(teacher.fullName, teacherX, signatureY + 25, { align: 'center' });
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${teacher.nip}`, teacherX, signatureY + 30, { align: 'center' });
                }
            }
            
            pdf.save(`Denah-Duduk-${selectedClass.replace(' ', '_')}-${selectedYear.replace('/', '-')}.pdf`);
            setNotification({ message: 'PDF berhasil dibuat.', type: 'success' });
        } catch (error) {
            console.error(error);
            setNotification({ message: 'Gagal membuat PDF.', type: 'error' });
        } finally {
            setIsProcessing(false);
        }
    };

    const renderChart = () => {
        if (!uiData) return null;
        if (isProcessing && !isEditing) {
             return (
                <div className="flex flex-col items-center justify-center min-h-[400px] bg-gray-100 rounded-lg">
                    <svg className="animate-spin h-10 w-10 text-indigo-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <p className="text-gray-600 font-semibold">Mempersiapkan PDF...</p>
                </div>
            );
        }

        const getTeacherDeskStyle = (): React.CSSProperties => {
            const { tablesPerRow } = uiData.config;
            const style: React.CSSProperties = { gridRow: '1 / 2' };

            switch (uiData.teacherDeskPosition) {
                case 'front-left':
                    style.gridColumn = '1 / 2';
                    style.justifySelf = 'center';
                    break;
                case 'front-right':
                    style.gridColumn = `${tablesPerRow} / ${tablesPerRow + 1}`;
                    style.justifySelf = 'center';
                    break;
                case 'front-center':
                default:
                     style.gridColumn = `1 / ${tablesPerRow + 1}`;
                     style.justifySelf = 'center';
                    break;
            }
            return style;
        };

        const TeacherDesk = () => (
             <div className="p-2 flex flex-col items-center space-y-1">
                <div className="w-8 h-8 bg-gray-300 border-2 border-gray-500 rounded-t-lg rounded-b-sm" />
                <div className="h-10 w-24 bg-amber-600 border-2 border-amber-800 rounded-md shadow-sm flex items-center justify-center">
                     <span className="text-xs font-bold text-gray-800">Meja Guru</span>
                </div>
            </div>
        );

        return (
            <div className="p-4 bg-gray-100 rounded-lg border-2 border-gray-400 flex flex-col">
                <div className="mb-4 p-3 bg-white border rounded-md text-center font-semibold text-gray-700 w-1/2 mx-auto">PAPAN TULIS</div>
                
                <div className="grid gap-x-1 gap-y-4" style={{ gridTemplateColumns: `repeat(${uiData.config.tablesPerRow}, minmax(0, 1fr))` }}>
                    <div style={getTeacherDeskStyle()} className="flex justify-center my-4">
                        <TeacherDesk />
                    </div>

                    {Array.from({ length: uiData.config.tablesPerRow * uiData.config.tablesPerColumn }).map((_, gridIndex) => {
                        const row = Math.floor(gridIndex / uiData.config.tablesPerRow);
                        const col = gridIndex % uiData.config.tablesPerRow;
                        const gridRowValue = row + 2;
                        const gridColumnValue = col + 1;
                        
                        if (gridToTableMap.has(gridIndex)) {
                            const tableIndex = gridToTableMap.get(gridIndex)!;
                            return (
                                <div key={gridIndex} style={{ gridRow: gridRowValue, gridColumn: gridColumnValue }}>
                                    <Desk
                                        studentsOnDesk={uiData.arrangement[tableIndex] || []}
                                        studentsPerTable={uiData.config.studentsPerTable}
                                        isEditing={isEditing}
                                        tableIndex={tableIndex}
                                        onStudentChange={handleStudentSeatChange}
                                        getAvailableStudents={getAvailableStudents}
                                    />
                                </div>
                            );
                        } else {
                            return <div key={gridIndex} style={{ gridRow: gridRowValue, gridColumn: gridColumnValue }} className="min-h-[100px]"></div>;
                        }
                    })}
                </div>
            </div>
        );
    };
    
    if (isLoading || !uiData) return <div className="text-center p-8">Memuat data...</div>;

    const maxTables = uiData.config.tablesPerRow * uiData.config.tablesPerColumn;
    const showLastRowSubPosition = uiData.lastRowPosition === 'center' && uiData.config.tablesPerRow % 2 === 0;

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg space-y-6">
            <div className="flex justify-between items-start">
                <h2 className="text-2xl font-bold text-gray-800">Denah Tempat Duduk</h2>
                <div className="flex items-center space-x-2">
                    {isEditing ? (
                        <>
                            <button onClick={handleCancel} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold">Batal</button>
                            <button onClick={handleSave} disabled={isProcessing} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold disabled:bg-indigo-400">
                                {isProcessing ? 'Menyimpan...' : 'Simpan Denah'}
                            </button>
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
                                    disabled={isProcessing || isLoading}
                                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-semibold shadow flex items-center space-x-2 disabled:bg-gray-400"
                                >
                                    <ArrowDownTrayIcon /> <span>{isProcessing ? 'Memproses...' : 'Download PDF'}</span>
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
                            <button onClick={handleEdit} disabled={isProcessing || isLoading} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold shadow flex items-center space-x-2 disabled:bg-indigo-400">
                                <PencilIcon /> <span>Edit Denah</span>
                            </button>
                        </>
                    )}
                </div>
            </div>

            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            
            <div className="space-y-4 p-6 border rounded-lg bg-gray-50">
                <div className="flex justify-between items-center">
                     <h3 className="text-lg font-bold text-gray-800">Konfigurasi Denah</h3>
                      {isEditing && (
                        <button onClick={handleRandomizeSeats} disabled={isProcessing || isLoading} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold shadow flex items-center space-x-2 disabled:bg-blue-400">
                            <SparklesIcon/>
                            <span>Tempatkan Siswa Acak</span>
                        </button>
                    )}
                </div>
               
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Jumlah Siswa</label>
                        <input type="number" value={uiData.totalStudents} disabled className="mt-1 block w-full p-2 border border-gray-300 rounded-md bg-gray-200 cursor-not-allowed"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Jml Meja ke Samping</label>
                        <input type="number" name="config.tablesPerRow" value={uiData.config.tablesPerRow} onChange={handleConfigChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md" disabled={!isEditing}/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Jml Meja ke Belakang</label>
                        <input type="number" name="config.tablesPerColumn" value={uiData.config.tablesPerColumn} onChange={handleConfigChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md" disabled={!isEditing}/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Siswa per Meja</label>
                        <input type="number" name="config.studentsPerTable" value={uiData.config.studentsPerTable} onChange={handleConfigChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md" disabled={!isEditing}/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Jumlah Meja</label>
                        <input type="number" name="config.totalTables" value={uiData.config.totalTables} onChange={handleConfigChange} max={maxTables} className="mt-1 block w-full p-2 border border-gray-300 rounded-md" disabled={!isEditing}/>
                    </div>
                </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t mt-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Posisi Meja Guru</label>
                         <select name="teacherDeskPosition" value={uiData.teacherDeskPosition} onChange={handleConfigChange} disabled={!isEditing} className="mt-1 block w-full p-2 border border-gray-300 rounded-md bg-white">
                            <option value="front-left">Depan Kiri</option>
                            <option value="front-center">Depan Tengah</option>
                            <option value="front-right">Depan Kanan</option>
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Posisi Meja Paling Belakang (Jika Sisa)</label>
                        <div className="flex space-x-4 mt-2">
                             <select name="lastRowPosition" value={uiData.lastRowPosition} onChange={handleConfigChange} disabled={!isEditing} className="block w-full p-2 border border-gray-300 rounded-md bg-white">
                                <option value="left">Samping Kiri</option>
                                <option value="center">Tengah</option>
                                <option value="right">Samping Kanan</option>
                            </select>
                            {showLastRowSubPosition && isEditing && (
                                <select name="lastRowSubPosition" value={uiData.lastRowSubPosition} onChange={handleConfigChange} disabled={!isEditing} className="block w-full p-2 border border-gray-300 rounded-md bg-white">
                                    <option value="left">Tengah Kiri</option>
                                    <option value="right">Tengah Kanan</option>
                                </select>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="border-t pt-6">
                <h3 className="text-xl font-bold text-center mb-4 text-gray-800">Pratinjau Denah</h3>
                {renderChart()}
            </div>
        </div>
    );
};

export default SeatingChart;
