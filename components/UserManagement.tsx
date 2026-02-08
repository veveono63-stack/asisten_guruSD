
import React, { useState, useEffect, useMemo } from 'react';
import { User, UserStatus } from '../types';
import { getTeacherUsers, updateUserStatus, deleteUser } from '../services/adminService';
import { requestPasswordReset } from '../services/authService';
import { CheckCircleIcon, XCircleIcon, ArrowPathIcon, EnvelopeIcon, TrashIcon, ExclamationTriangleIcon } from './Icons';
import Notification, { NotificationType } from './Notification';

const UserCard: React.FC<{
    user: User;
    actions: React.ReactNode;
    isSubmitting: boolean;
}> = ({ user, actions, isSubmitting }) => (
    <div className={`bg-white p-4 rounded-lg border border-gray-200 shadow-sm transition-all duration-300 ${isSubmitting ? 'opacity-50' : 'opacity-100'}`}>
        <div className="flex justify-between items-start">
            <div className="flex-1">
                <p className="font-bold text-gray-800">{user.fullName}</p>
                <p className="text-sm text-gray-600">{user.email}</p>
                <p className="text-sm text-gray-500 mt-1">{user.schoolName} - {user.className}</p>
            </div>
            <div className="flex space-x-2 ml-4">
                {actions}
            </div>
        </div>
    </div>
);


const UserGroup: React.FC<{
    title: string;
    users: User[];
    colorClass: string;
    children: (user: User) => React.ReactNode;
}> = ({ title, users, colorClass, children }) => (
    <div className="bg-gray-50 rounded-xl shadow-md overflow-hidden">
        <div className={`p-4 border-b ${colorClass} text-white`}>
            <h3 className="text-lg font-bold">{title} ({users.length})</h3>
        </div>
        <div className="p-4 space-y-3">
            {users.length > 0 ? (
                users.map(user => children(user))
            ) : (
                <p className="text-center text-gray-500 py-4">Tidak ada pengguna dalam kategori ini.</p>
            )}
        </div>
    </div>
);

const UserManagement: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [submittingUserId, setSubmittingUserId] = useState<string | null>(null);
    
    // Deletion specific states
    const [userToDelete, setUserToDelete] = useState<User | null>(null);
    const [isDeepCleaning, setIsDeepCleaning] = useState(false);
    
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                setIsLoading(true);
                const fetchedUsers = await getTeacherUsers();
                setUsers(fetchedUsers);
            } catch (err: any) {
                setError(err.message || 'Gagal memuat data pengguna.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchUsers();
    }, []);

    const handleUpdateStatus = async (user: User, newStatus: UserStatus) => {
        setSubmittingUserId(user.id);
        setNotification(null);
        try {
            await updateUserStatus(user.id, newStatus);
            setUsers(prevUsers => 
                prevUsers.map(u => u.id === user.id ? { ...u, status: newStatus } : u)
            );
            setNotification({ message: `Status ${user.fullName} berhasil diubah.`, type: 'success' });
        } catch (error) {
            setNotification({ message: 'Gagal memperbarui status pengguna.', type: 'error' });
        } finally {
            setSubmittingUserId(null);
        }
    };
    
    const handleResetPassword = async (user: User) => {
        setSubmittingUserId(user.id);
        setNotification(null);
        const result = await requestPasswordReset(user.email);
        setNotification({ message: result.message, type: result.success ? 'success' : 'error' });
        setSubmittingUserId(null);
    };

    const startDeleteProcess = (user: User) => {
        setUserToDelete(user);
    };

    const confirmDeleteUser = async () => {
        if (!userToDelete) return;
        
        setIsDeepCleaning(true);
        setNotification(null);

        try {
            await deleteUser(userToDelete.id, userToDelete.username);
            setUsers(prevUsers => prevUsers.filter(u => u.id !== userToDelete.id));
            setNotification({ message: `Akun "${userToDelete.fullName}" dan seluruh datanya telah dibersihkan secara permanen.`, type: 'success' });
            setUserToDelete(null);
        } catch (error: any) {
            setNotification({ message: `Gagal menghapus: ${error.message}`, type: 'error' });
        } finally {
            setIsDeepCleaning(false);
        }
    };

    const { pendingUsers, approvedUsers, rejectedUsers } = useMemo(() => {
        return {
            pendingUsers: users.filter(u => u.status === 'pending').sort((a, b) => a.fullName.localeCompare(b.fullName)),
            approvedUsers: users.filter(u => u.status === 'approved').sort((a, b) => a.fullName.localeCompare(b.fullName)),
            rejectedUsers: users.filter(u => u.status === 'rejected').sort((a, b) => a.fullName.localeCompare(b.fullName)),
        };
    }, [users]);
    
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <svg className="animate-spin h-10 w-10 text-indigo-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-gray-500">Memuat manajemen pengguna...</p>
            </div>
        );
    }

    if (error) {
        return <div className="text-center text-red-600 bg-red-100 p-4 rounded-lg">{error}</div>;
    }

    return (
        <div className="space-y-8 relative">
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            
            <UserGroup title="Perlu Persetujuan" users={pendingUsers} colorClass="bg-yellow-500">
                {(user) => (
                    <UserCard 
                        key={user.id} 
                        user={user} 
                        isSubmitting={submittingUserId === user.id} 
                        actions={
                            <>
                                <button onClick={() => handleUpdateStatus(user, 'approved')} disabled={submittingUserId !== null} className="p-2 text-green-600 hover:bg-green-100 rounded-full transition-colors"><CheckCircleIcon /></button>
                                <button onClick={() => handleUpdateStatus(user, 'rejected')} disabled={submittingUserId !== null} className="p-2 text-red-600 hover:bg-red-100 rounded-full transition-colors"><XCircleIcon /></button>
                            </>
                        }
                    />
                )}
            </UserGroup>

            <UserGroup title="Pengguna Terdaftar" users={approvedUsers} colorClass="bg-green-500">
                {(user) => (
                    <UserCard 
                        key={user.id} 
                        user={user} 
                        isSubmitting={submittingUserId === user.id} 
                        actions={
                            <>
                                <button onClick={() => handleResetPassword(user)} disabled={submittingUserId !== null} className="p-2 text-blue-600 hover:bg-blue-100 rounded-full transition-colors" title="Reset Password"><EnvelopeIcon /></button>
                                <button onClick={() => handleUpdateStatus(user, 'rejected')} disabled={submittingUserId !== null} className="p-2 text-red-600 hover:bg-red-100 rounded-full transition-colors" title="Tolak/Blokir Pengguna"><XCircleIcon /></button>
                            </>
                        }
                    />
                )}
            </UserGroup>
            
            <UserGroup title="Pengguna Ditolak" users={rejectedUsers} colorClass="bg-red-500">
                {(user) => (
                    <UserCard 
                        key={user.id} 
                        user={user} 
                        isSubmitting={submittingUserId === user.id} 
                        actions={
                            <>
                                <button onClick={() => handleUpdateStatus(user, 'approved')} disabled={submittingUserId !== null} className="p-2 text-green-600 hover:bg-green-100 rounded-full transition-colors" title="Setujui Pengguna"><ArrowPathIcon /></button>
                                <button onClick={() => startDeleteProcess(user)} disabled={submittingUserId !== null} className="p-2 text-red-600 hover:bg-red-100 rounded-full transition-colors" title="Hapus Pengguna Permanen"><TrashIcon /></button>
                            </>
                        }
                    />
                )}
            </UserGroup>

            {/* MODAL KONFIRMASI HAPUS PERMANEN */}
            {userToDelete && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black bg-opacity-60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all animate-fade-in scale-100">
                        {isDeepCleaning ? (
                            <div className="p-10 flex flex-col items-center justify-center text-center space-y-6">
                                <div className="relative">
                                    <div className="absolute inset-0 rounded-full bg-red-100 animate-ping opacity-75"></div>
                                    <svg className="animate-spin h-16 w-16 text-red-600 relative z-10" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-xl font-black text-red-600 uppercase tracking-tighter">MEMBERSIHKAN DATABASE</h3>
                                    <p className="text-gray-600 text-sm font-medium">Sedang menyisir dan menghapus data guru <br/><span className="font-bold text-gray-800">"{userToDelete.fullName}"</span></p>
                                </div>
                                <p className="text-xs text-gray-400 italic">Mohon tunggu, jangan tutup halaman ini...</p>
                            </div>
                        ) : (
                            <div className="p-6">
                                <div className="flex items-center justify-center w-16 h-16 mx-auto bg-red-100 rounded-full mb-4">
                                    <ExclamationTriangleIcon className="w-10 h-10 text-red-600" />
                                </div>
                                <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Hapus Permanen?</h3>
                                <p className="text-gray-600 text-center text-sm mb-6">
                                    Anda akan menghapus <span className="font-bold text-gray-800">"{userToDelete.fullName}"</span> beserta <span className="text-red-600 font-bold">SELURUH</span> data administrasi dan perangkat pembelajarannya di database.
                                    <br/><br/>
                                    Tindakan ini <span className="underline font-bold">tidak dapat dibatalkan</span>.
                                </p>
                                <div className="flex flex-col gap-2">
                                    <button 
                                        onClick={confirmDeleteUser}
                                        className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
                                    >
                                        YA, HAPUS SEKARANG
                                    </button>
                                    <button 
                                        onClick={() => setUserToDelete(null)}
                                        className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                                    >
                                        BATALKAN
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserManagement;
