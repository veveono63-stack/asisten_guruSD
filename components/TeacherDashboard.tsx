
import React, { useState, useEffect, useMemo } from 'react';
import { User, SchoolIdentity, Teacher } from '../types';
import { 
    getSchoolIdentity, 
    updateSchoolIdentity, 
    getTeacherProfile, 
    updateTeacherProfile
} from '../services/adminService';
import SchoolIdentityForm from './SchoolIdentityForm';
import TeacherBiodataForm from './TeacherBiodataForm';
import SubjectList from './SubjectList';
import StudentList from './StudentList';
import AcademicCalendar from './AcademicCalendar';
import ClassStructure from './ClassStructure';
import ClassSchedule from './ClassSchedule';
import ClassPiketSchedule from './ClassPiketSchedule';
import ClassAgreement from './ClassAgreement';
import SeatingChart from './SeatingChart';
import InventoryList from './InventoryList';
import StudentSavingsList from './StudentSavingsList';
import SupervisionSheet from './SupervisionSheet';
import MeetingMinutes from './MeetingMinutes';
import LearningOutcomes from './LearningOutcomes';
import LearningObjectives from './LearningObjectives';
import LearningGoalsPathway from './LearningGoalsPathway';
import KKTP from './KKTP';
import Prota from './Prota';
import Prosem from './Prosem';
import ModulAjar from './ModulAjar';
import ProgramKokurikuler from './ProgramKokurikuler';
import JurnalPembelajaran from './JurnalPembelajaran';
import StudentAttendance from './StudentAttendance';
import GuidanceCounselingBook from './GuidanceCounselingBook';
import ExtracurricularBook from './ExtracurricularBook';
import BankSoal from './BankSoal'; 
import StudentGradesList from './StudentGradesList';
import AssessmentAnalysis from './AssessmentAnalysis'; 
import AssessmentKokurikuler from './AssessmentKokurikuler';
import RemedialEnrichment from './RemedialEnrichment';
import Notification, { NotificationType } from './Notification';

import { 
    Cog6ToothIcon, 
    ArrowLeftOnRectangleIcon, 
    ChevronDoubleLeftIcon, 
    ChevronDoubleRightIcon, 
    ChevronDownIcon,
    ClipboardDocumentListIcon,
    ArchiveBoxIcon,
    BookOpenIcon,
    PresentationChartLineIcon,
    ChartBarIcon
} from './Icons';

interface TeacherDashboardProps {
    user: User;
    onLogout: () => void;
}

const teacherMenuCategories = [
    { 
        category: 'DATA SEKOLAH & GURU',
        icon: <ClipboardDocumentListIcon />,
        items: [
            { key: 'identitas-sekolah', label: 'Identitas Sekolah' },
            { key: 'biodata-guru', label: 'Biodata Guru' },
            { key: 'daftar-pelajaran', label: 'Daftar Pelajaran' },
        ],
    },
    { 
        category: 'ADMINISTRASI UMUM',
        icon: <ArchiveBoxIcon />,
        items: [
            { key: 'daftar-siswa', label: 'Daftar Siswa' },
            { key: 'kalender-pendidikan', label: 'Kalender Pendidikan' },
            { key: 'struktur-organisasi-kelas', label: 'Struktur Organisasi' },
            { key: 'jadwal-pelajaran', label: 'Jadwal Pelajaran' },
            { key: 'jadwal-piket-kelas', label: 'Jadwal Piket' },
            { key: 'kesepakatan-kelas', label: 'Kesepakatan' },
            { key: 'denah-tempat-duduk', label: 'Denah Tempat Duduk' },
            { key: 'daftar-inventaris-kelas', label: 'Daftar Inventaris' },
            { key: 'daftar-tabungan-siswa', label: 'Daftar Tabungan Siswa' },
            { key: 'lembar-supervisi', label: 'Lembar Supervisi' },
            { key: 'notulen-rapat', label: 'Notulen Rapat' },
        ],
    },
    { 
        category: 'PERENCANAAN PEMBELAJARAN',
        icon: <BookOpenIcon />,
        items: [
            { key: 'cp', label: 'Capaian Pembelajaran (CP)' },
            { key: 'tp', label: 'Tujuan Pembelajaran (TP)' },
            { key: 'atp', label: 'Alur Tujuan Pembelajaran (ATP)' },
            { key: 'kktp', label: 'Kriteria Ketercapaian Tujuan Pembelajaran (KKTP)' },
            { key: 'prota', label: 'Program Tahunan (PROTA)' },
            { key: 'prosem', label: 'Program Semester (PROSEM)' },
            { key: 'modul-ajar', label: 'Modul Ajar / RPP' },
            { key: 'rencana-kokurikuler', label: 'Program Kokurikuler' },
        ],
    },
    {
        category: 'PELAKSANAAN PEMBELAJARAN',
        icon: <PresentationChartLineIcon />,
        items: [
            { key: 'jurnal-pembelajaran', label: 'Jurnal Pembelajaran' },
            { key: 'daftar-hadir-siswa', label: 'Daftar Hadir Siswa' },
            { key: 'buku-bimbingan', label: 'Buku Bimbingan dan Konseling' },
            { key: 'buku-ekstrakurikuler', label: 'Buku Ekstrakurikuler' },
        ],
    },
    {
        category: 'PENILAIAN DAN EVALUASI',
        icon: <ChartBarIcon />,
        items: [
            { key: 'bank-soal', label: 'Bank Soal' },
            { key: 'daftar-nilai', label: 'Daftar Nilai Siswa' },
            { key: 'analisis-hasil', label: 'Analisis Hasil Penilaian' },
            { key: 'penilaian-kokurikuler', label: 'Penilaian Kokurikuler' },
            { key: 'remedial-pengayaan', label: 'Remedial / Pengayaan' },
        ],
    }
];

const academicYears = ['2024/2025', '2025/2026', '2026/2027', '2027/2028'];

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ user, onLogout }) => {
    const [activeView, setActiveView] = useState('identitas-sekolah');
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [selectedYear, setSelectedYear] = useState('2025/2026');
    const [isYearDropdownOpen, setIsYearDropdownOpen] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);
    
    // State untuk sinkronisasi nama sekolah di sidebar
    const [displaySchoolName, setDisplaySchoolName] = useState(user.schoolName);

    // Update display name jika prop user berubah (misal saat baru login)
    useEffect(() => {
        setDisplaySchoolName(user.schoolName);
    }, [user.schoolName]);

    // Initial Data Sync: Pastikan Identitas & Biodata dari pendaftaran ada di database guru
    useEffect(() => {
        const syncIdentityAndProfile = async () => {
            try {
                // 1. Cek Identitas Sekolah
                const identity = await getSchoolIdentity(user.id);
                if (!identity) {
                    await updateSchoolIdentity({
                        schoolName: user.schoolName,
                        npsn: '', nss: '', address: '', postalCode: '', phone: '',
                        subdistrict: '', district: '', city: '', province: '',
                        website: '', email: '', principalName: '', principalNip: ''
                    }, user.id);
                } else {
                    // Update sidebar dengan data terbaru dari Firestore jika sudah ada
                    setDisplaySchoolName(identity.schoolName);
                }

                // 2. Cek Biodata Guru
                const profile = await getTeacherProfile(selectedYear, user.className, user.id);
                if (profile.fullName === '') {
                    await updateTeacherProfile(selectedYear, user.className, {
                        fullName: user.fullName,
                        email: user.email,
                        position: `Guru ${user.className}`,
                        nip: '', nik: '', nuptk: '', gender: 'Laki-laki', birthPlace: '', birthDate: '',
                        employmentStatus: 'PNS', lastEducation: '', religion: 'Islam', address: '', phone: ''
                    }, user.id);
                }
            } catch (error) {
                console.error("Sync error:", error);
            }
        };
        syncIdentityAndProfile();
    }, [user.id, user.schoolName, user.fullName, user.email, user.className, selectedYear]);

    const currentViewTitle = useMemo(() => {
        for (const cat of teacherMenuCategories) {
            const item = cat.items.find(i => i.key === activeView);
            if (item) return item.label;
        }
        return 'Dasbor Guru';
    }, [activeView]);

    const renderContent = () => {
        // Shared logic: Pass user.id to all components so they use teachersData path
        const commonProps = { selectedClass: user.className, selectedYear: selectedYear, userId: user.id };
        
        switch (activeView) {
            case 'identitas-sekolah': 
                return (
                    <SchoolIdentityForm 
                        {...commonProps} 
                        registeredSchoolName={user.schoolName} 
                        onNameChange={(newName) => setDisplaySchoolName(newName)} 
                    />
                );
            case 'biodata-guru': return <TeacherBiodataForm {...commonProps} />;
            case 'daftar-pelajaran': return <SubjectList {...commonProps} />;
            case 'daftar-siswa': return <StudentList {...commonProps} />;
            case 'kalender-pendidikan': return <AcademicCalendar {...commonProps} />;
            case 'struktur-organisasi-kelas': return <ClassStructure {...commonProps} />;
            case 'jadwal-pelajaran': return <ClassSchedule {...commonProps} />;
            case 'jadwal-piket-kelas': return <ClassPiketSchedule {...commonProps} />;
            case 'kesepakatan-kelas': return <ClassAgreement {...commonProps} />;
            case 'denah-tempat-duduk': return <SeatingChart {...commonProps} />;
            case 'daftar-inventaris-kelas': return <InventoryList {...commonProps} />;
            case 'daftar-tabungan-siswa': return <StudentSavingsList {...commonProps} />;
            case 'lembar-supervisi': return <SupervisionSheet {...commonProps} />;
            case 'notulen-rapat': return <MeetingMinutes {...commonProps} />;
            case 'cp': return <LearningOutcomes {...commonProps} />;
            case 'tp': return <LearningObjectives {...commonProps} />;
            case 'atp': return <LearningGoalsPathway {...commonProps} />;
            case 'kktp': return <KKTP {...commonProps} />;
            case 'prota': return <Prota {...commonProps} />;
            case 'prosem': return <Prosem {...commonProps} />;
            case 'modul-ajar': return <ModulAjar {...commonProps} />;
            case 'rencana-kokurikuler': return <ProgramKokurikuler {...commonProps} />;
            case 'jurnal-pembelajaran': return <JurnalPembelajaran {...commonProps} />;
            case 'daftar-hadir-siswa': return <StudentAttendance {...commonProps} />;
            case 'buku-bimbingan': return <GuidanceCounselingBook {...commonProps} />;
            case 'buku-ekstrakurikuler': return <ExtracurricularBook {...commonProps} />;
            case 'bank-soal': return <BankSoal {...commonProps} />;
            case 'daftar-nilai': return <StudentGradesList {...commonProps} />;
            case 'analisis-hasil': return <AssessmentAnalysis {...commonProps} />;
            case 'penilaian-kokurikuler': return <AssessmentKokurikuler {...commonProps} />;
            case 'remedial-pengayaan': return <RemedialEnrichment {...commonProps} />;
            default: return <div className="p-8 text-center bg-white rounded-lg shadow">Pilih menu untuk melihat konten.</div>;
        }
    };

    return (
        <div className="flex h-screen bg-gray-100 font-sans">
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            
            {/* Sidebar Guru */}
            <aside className={`bg-indigo-900 text-white flex flex-col p-4 shadow-2xl transition-all duration-300 ${isSidebarCollapsed ? 'w-20' : 'w-80'}`}>
                <div className={`text-center mb-8 mt-4 transition-all ${isSidebarCollapsed ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}>
                    <h1 className="text-xl font-bold tracking-wider">DASBOR GURU</h1>
                    <p className="text-xs text-indigo-300">{displaySchoolName}</p>
                </div>

                <nav className="flex-grow overflow-y-auto custom-scrollbar">
                    <ul className="space-y-6">
                        {teacherMenuCategories.map(category => (
                            <li key={category.category}>
                                {!isSidebarCollapsed && (
                                    <div className="flex items-center px-2 py-1 mb-2 text-indigo-300/80">
                                        {category.icon && React.cloneElement(category.icon as any, { className: 'w-4 h-4 mr-2' })}
                                        <span className="text-[10px] font-bold uppercase tracking-widest">{category.category}</span>
                                    </div>
                                )}
                                <ul className="space-y-1">
                                    {category.items.map(item => (
                                        <li key={item.key}>
                                            <button
                                                onClick={() => setActiveView(item.key)}
                                                className={`w-full text-left py-2 px-4 rounded-md text-xs transition-all ${
                                                    activeView === item.key
                                                        ? 'text-white bg-indigo-600 shadow-md font-bold'
                                                        : 'text-gray-400 hover:text-white hover:bg-indigo-700/50'
                                                } ${isSidebarCollapsed ? 'flex justify-center px-0' : ''}`}
                                                title={item.label}
                                            >
                                                {isSidebarCollapsed ? item.label.charAt(0) : item.label}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </li>
                        ))}
                    </ul>
                </nav>

                <div className="mt-auto pt-4 border-t border-indigo-800">
                    <button
                        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                        className="flex items-center w-full p-3 rounded-lg text-gray-300 hover:bg-indigo-700 transition-colors mb-2"
                    >
                        {isSidebarCollapsed ? <ChevronDoubleRightIcon className="w-6 h-6 mx-auto" /> : <><ChevronDoubleLeftIcon className="w-6 h-6" /><span className="ml-4 font-semibold">Sembunyikan</span></>}
                    </button>
                    <button
                        onClick={onLogout}
                        className="flex items-center w-full p-3 rounded-lg text-gray-300 hover:bg-red-600 transition-colors"
                    >
                        <ArrowLeftOnRectangleIcon className={`${isSidebarCollapsed ? 'mx-auto' : ''}`} />
                        {!isSidebarCollapsed && <span className="ml-4 font-semibold">Keluar</span>}
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-white shadow-sm p-4 flex justify-between items-center border-b">
                    <div className="flex items-center space-x-6">
                        <h2 className="text-xl font-bold text-gray-800">{currentViewTitle}</h2>
                        
                        <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-gray-500 uppercase">Tahun Ajaran:</span>
                            <div className="relative">
                                <button 
                                    onClick={() => setIsYearDropdownOpen(!isYearDropdownOpen)}
                                    className="flex items-center space-x-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-1.5 px-4 rounded-lg border text-sm"
                                >
                                    <span>{selectedYear}</span>
                                    <ChevronDownIcon className={`w-4 h-4 transition-transform ${isYearDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {isYearDropdownOpen && (
                                    <div className="absolute z-50 mt-2 w-40 bg-white rounded-md shadow-xl border border-gray-200" onMouseLeave={() => setIsYearDropdownOpen(false)}>
                                        <ul className="py-1">
                                            {academicYears.map(year => (
                                                <li key={year}>
                                                    <button 
                                                        onClick={() => { setSelectedYear(year); setIsYearDropdownOpen(false); }}
                                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50"
                                                    >
                                                        {year}
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="text-right">
                        <p className="font-bold text-gray-800 leading-tight">{user.fullName}</p>
                        <p className="text-xs text-indigo-600 font-semibold uppercase">{user.className}</p>
                    </div>
                </header>
                
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                    {renderContent()}
                </div>
            </main>
        </div>
    );
};

export default TeacherDashboard;
