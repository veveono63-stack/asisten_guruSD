
import React, { useState, useMemo } from 'react';
import { User } from '../types';
import UserManagement from './UserManagement';
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
    UsersIcon, 
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

interface AdminDashboardProps {
    user: User;
    onLogout: () => void;
}

const adminMenu = [
    { 
        category: 'A. DATA SEKOLAH, GURU, DAN MAPEL',
        icon: <ClipboardDocumentListIcon />,
        items: [
            { key: 'identitas-sekolah', label: 'Identitas Sekolah' },
            { key: 'biodata-guru', label: 'Biodata Guru' },
            { key: 'daftar-pelajaran', label: 'Daftar Pelajaran' },
        ],
    },
    { 
        category: 'B. ADMINISTRASI UMUM',
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
        category: 'C. PERENCANAAN PEMBELAJARAN',
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
        category: 'D. PELAKSANAAN PEMBELAJARAN',
        icon: <PresentationChartLineIcon />,
        items: [
            { key: 'jurnal-pembelajaran', label: 'Jurnal Pembelajaran' },
            { key: 'daftar-hadir-siswa', label: 'Daftar Hadir Siswa' },
            { key: 'buku-bimbingan', label: 'Buku Bimbingan dan Konseling' },
            { key: 'buku-ekstrakurikuler', label: 'Buku Ekstrakurikuler' },
        ],
    },
    {
        category: 'E. PENILAIAN DAN EVALUASI',
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

const classLevels = ['Kelas I', 'Kelas II', 'Kelas III', 'Kelas IV', 'Kelas V', 'Kelas VI'];
const academicYears = ['2024/2025', '2025/2026', '2026/2027', '2027/2028'];

interface PlaceholderProps {
    title: string;
    selectedClass?: string;
    selectedYear?: string;
}

const PlaceholderContent: React.FC<PlaceholderProps> = ({ title, selectedClass, selectedYear }) => (
    <div className="bg-white p-8 rounded-lg shadow-lg text-center">
        <h1 className="text-2xl font-bold text-gray-800">{title}</h1>
        {selectedClass && selectedYear && (
             <p className="mt-2 text-lg text-indigo-600 font-semibold">
                Menampilkan data untuk: {selectedClass} (T.A {selectedYear})
             </p>
        )}
        <p className="mt-4 text-gray-600">Fitur ini sedang dalam tahap pengembangan. Silakan kembali lagi nanti.</p>
    </div>
);


const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout }) => {
    const [activeView, setActiveView] = useState('users');
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isIndukAdminOpen, setIsIndukAdminOpen] = useState(false);
    const [selectedClass, setSelectedClass] = useState('Kelas I');
    const [selectedYear, setSelectedYear] = useState('2025/2026');
    const [isClassDropdownOpen, setIsClassDropdownOpen] = useState(false);
    const [isYearDropdownOpen, setIsYearDropdownOpen] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);

    const isIndukAdminActive = useMemo(() => {
        return adminMenu.flatMap(cat => cat.items).some(item => item.key === activeView);
    }, [activeView]);

    const handleIndukAdminClick = () => {
        if (isSidebarCollapsed) {
            setIsSidebarCollapsed(false);
            setIsIndukAdminOpen(true);
        } else {
            setIsIndukAdminOpen(!isIndukAdminOpen);
        }
    };
    
    const currentViewTitle = useMemo(() => {
        if (activeView === 'users') return 'Manajemen Pengguna';
        for (const category of adminMenu) {
            for (const item of category.items) {
                if (item.key === activeView) {
                    return item.label;
                }
            }
        }
        return 'Dasbor';
    }, [activeView]);
    
    const renderContent = () => {
        switch (activeView) {
            case 'users':
                return <UserManagement />;
            case 'identitas-sekolah':
                return <SchoolIdentityForm selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'biodata-guru':
                return <TeacherBiodataForm selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'daftar-pelajaran':
                return <SubjectList selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'daftar-siswa':
                return <StudentList selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'kalender-pendidikan':
                return <AcademicCalendar selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'struktur-organisasi-kelas':
                return <ClassStructure selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'jadwal-pelajaran':
                return <ClassSchedule selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'jadwal-piket-kelas':
                return <ClassPiketSchedule selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'kesepakatan-kelas':
                return <ClassAgreement selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'denah-tempat-duduk':
                return <SeatingChart selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'daftar-inventaris-kelas':
                return <InventoryList selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'daftar-tabungan-siswa':
                return <StudentSavingsList selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'lembar-supervisi':
                return <SupervisionSheet selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'notulen-rapat':
                return <MeetingMinutes selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'cp':
                return <LearningOutcomes selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'tp':
                return <LearningObjectives selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'atp':
                return <LearningGoalsPathway selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'kktp':
                return <KKTP selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'prota':
                return <Prota selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'prosem':
                return <Prosem selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'modul-ajar':
                return <ModulAjar selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'rencana-kokurikuler':
                return <ProgramKokurikuler selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'jurnal-pembelajaran':
                return <JurnalPembelajaran selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'daftar-hadir-siswa':
                return <StudentAttendance selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'buku-bimbingan':
                return <GuidanceCounselingBook selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'buku-ekstrakurikuler':
                return <ExtracurricularBook selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'bank-soal':
                return <BankSoal selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'daftar-nilai':
                return <StudentGradesList selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'analisis-hasil':
                return <AssessmentAnalysis selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'penilaian-kokurikuler':
                return <AssessmentKokurikuler selectedClass={selectedClass} selectedYear={selectedYear} />;
            case 'remedial-pengayaan':
                return <RemedialEnrichment selectedClass={selectedClass} selectedYear={selectedYear} />;
            default:
                return (
                    <PlaceholderContent 
                        title={currentViewTitle} 
                        selectedClass={isIndukAdminActive ? selectedClass : undefined}
                        selectedYear={isIndukAdminActive ? selectedYear : undefined}
                    />
                );
        }
    };

    return (
        <div className="flex h-screen bg-gray-100 font-sans">
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            
            {/* Sidebar */}
            <aside className={`bg-indigo-900 text-white flex flex-col p-4 shadow-2xl transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'w-20' : 'w-80'}`}>
                <div className={`text-center mb-10 mt-4 transition-opacity duration-200 ${isSidebarCollapsed ? 'opacity-0 scale-0 h-0' : 'opacity-100'}`}>
                    <h1 className="text-2xl font-bold tracking-wider">Admin Dasbor</h1>
                    <p className="text-sm text-indigo-300">E-Perangkat Guru</p>
                </div>
                <nav className="flex-grow overflow-y-auto">
                    <ul>
                        {/* Manajemen Pengguna */}
                        <li className="mb-2">
                            <button
                                onClick={() => setActiveView('users')}
                                className={`flex items-center w-full p-3 rounded-lg transition-colors duration-200 ${
                                    activeView === 'users'
                                        ? 'bg-indigo-700 text-white shadow-lg'
                                        : 'text-gray-300 hover:bg-indigo-500 hover:text-white'
                                } ${isSidebarCollapsed ? 'justify-center' : ''}`}
                                title={isSidebarCollapsed ? "Manajemen Pengguna" : ''}
                            >
                                <UsersIcon />
                                {!isSidebarCollapsed && <span className="ml-4 font-semibold">Manajemen Pengguna</span>}
                            </button>
                        </li>

                        {/* Induk Administrasi */}
                        <li className="mb-2">
                             <button
                                onClick={handleIndukAdminClick}
                                className={`flex items-center w-full p-3 rounded-lg transition-colors duration-200 ${
                                    isIndukAdminActive
                                        ? 'bg-indigo-700 text-white shadow-lg'
                                        : 'text-gray-300 hover:bg-indigo-500 hover:text-white'
                                } ${isSidebarCollapsed ? 'justify-center' : ''}`}
                                title={isSidebarCollapsed ? "Induk Administrasi" : ''}
                            >
                                <Cog6ToothIcon />
                                {!isSidebarCollapsed && <span className="ml-4 font-semibold flex-1 text-left">Induk Administrasi</span>}
                                {!isSidebarCollapsed && <ChevronDownIcon className={`w-5 h-5 transition-transform duration-300 ${isIndukAdminOpen ? 'rotate-180' : ''}`} />}
                            </button>
                            <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isIndukAdminOpen && !isSidebarCollapsed ? 'max-h-[9999px]' : 'max-h-0'}`}>
                                <ul className="pl-4 mt-2 space-y-1">
                                    {adminMenu.map(category => (
                                        <li key={category.category}>
                                            <div className="flex items-center py-2 text-indigo-300">
                                                {category.icon && React.cloneElement(category.icon, { className: 'w-5 h-5 mr-3' })}
                                                <span className="text-xs font-bold uppercase tracking-wider">{category.category.split('. ')[1]}</span>
                                            </div>
                                            <ul className="pl-4 border-l-2 border-indigo-700 ml-2.5">
                                                 {category.items.map(item => (
                                                    <li key={item.key}>
                                                        <button
                                                            onClick={() => setActiveView(item.key)}
                                                            className={`w-full text-left py-2 px-4 rounded-md text-sm transition-colors ${
                                                                activeView === item.key
                                                                    ? 'text-white bg-indigo-600'
                                                                    : 'text-gray-400 hover:text-white hover:bg-indigo-500/50'
                                                            }`}
                                                        >
                                                            {item.label}
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </li>
                    </ul>
                </nav>
                <div className="mt-auto">
                    <div className="pt-4 border-t border-indigo-800">
                         <button
                            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                            className={`flex items-center w-full p-3 rounded-lg transition-colors duration-200 text-gray-300 hover:bg-indigo-500 hover:text-white mb-2 ${isSidebarCollapsed ? 'justify-center' : ''}`}
                            title={isSidebarCollapsed ? "Tampilkan Menu" : "Sembunyikan Menu"}
                         >
                            {isSidebarCollapsed ? <ChevronDoubleRightIcon className="w-6 h-6" /> : <ChevronDoubleLeftIcon className="w-6 h-6" />}
                            {!isSidebarCollapsed && <span className="ml-4 font-semibold">Sembunyikan</span>}
                        </button>
                         <button
                            onClick={onLogout}
                            className={`flex items-center w-full p-3 rounded-lg transition-colors duration-200 text-gray-300 hover:bg-red-500 hover:text-white ${isSidebarCollapsed ? 'justify-center' : ''}`}
                             title={isSidebarCollapsed ? "Keluar" : ''}
                         >
                            <ArrowLeftOnRectangleIcon />
                            {!isSidebarCollapsed && <span className="ml-4 font-semibold">Keluar</span>}
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-white shadow-md p-4 flex justify-between items-center">
                    <div className="flex items-center space-x-4">
                        <h2 className="text-xl font-semibold text-gray-700">
                            {currentViewTitle}
                        </h2>

                        {isIndukAdminActive && (
                           <div className="flex items-center space-x-4">
                                <div className="relative">
                                    <button 
                                        onClick={() => setIsClassDropdownOpen(!isClassDropdownOpen)}
                                        className="flex items-center space-x-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-lg transition-colors"
                                    >
                                        <span>{selectedClass}</span>
                                        <ChevronDownIcon className={`w-5 h-5 transition-transform duration-200 ${isClassDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    {isClassDropdownOpen && (
                                        <div 
                                            className="absolute z-10 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200"
                                            onMouseLeave={() => setIsClassDropdownOpen(false)}
                                        >
                                            <ul className="py-1">
                                                {classLevels.map(level => (
                                                    <li key={level}>
                                                        <button 
                                                            onClick={() => {
                                                                setSelectedClass(level);
                                                                setIsClassDropdownOpen(false);
                                                            }}
                                                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-white"
                                                        >
                                                            {level}
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                                <div className="relative">
                                    <button 
                                        onClick={() => setIsYearDropdownOpen(!isYearDropdownOpen)}
                                        className="flex items-center space-x-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-lg transition-colors"
                                    >
                                        <span>T.A {selectedYear}</span>
                                        <ChevronDownIcon className={`w-5 h-5 transition-transform duration-200 ${isYearDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    {isYearDropdownOpen && (
                                        <div 
                                            className="absolute z-10 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200"
                                            onMouseLeave={() => setIsYearDropdownOpen(false)}
                                        >
                                            <ul className="py-1">
                                                {academicYears.map(year => (
                                                    <li key={year}>
                                                        <button 
                                                            onClick={() => {
                                                                setSelectedYear(year);
                                                                setIsYearDropdownOpen(false);
                                                            }}
                                                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-white"
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
                        )}
                    </div>
                    <div className="text-right">
                        <p className="font-medium text-gray-800">{user.fullName}</p>
                        <p className="text-sm text-gray-500">{user.email}</p>
                    </div>
                </header>
                
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                    {renderContent()}
                </div>
            </main>
        </div>
    );
};

export default AdminDashboard;
