
import React, { useState, useEffect, FormEvent } from 'react';
import { Teacher } from '../types';
import { getTeacherProfile, updateTeacherProfile } from '../services/adminService';
import Notification, { NotificationType } from './Notification';

interface TeacherBiodataFormProps {
    selectedClass: string;
    selectedYear: string;
    userId?: string;
}

const TeacherProfileForm: React.FC<TeacherBiodataFormProps> = ({ selectedClass, selectedYear, userId }) => {
    const [formData, setFormData] = useState<Omit<Teacher, 'id'> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);

    useEffect(() => {
        const fetchProfile = async () => {
            setIsLoading(true);
            try {
                const profile = await getTeacherProfile(selectedYear, selectedClass, userId);
                const { id, ...data } = profile;
                setFormData(data);
            } catch (error: any) {
                setNotification({ message: 'Gagal memuat data profil guru.', type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchProfile();
    }, [selectedClass, selectedYear, userId]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        if (formData) {
            setFormData({ ...formData, [e.target.name]: e.target.value });
        }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!formData) return;
        setIsSubmitting(true);
        try {
            await updateTeacherProfile(selectedYear, selectedClass, formData, userId);
            setNotification({ message: 'Biodata guru berhasil diperbarui.', type: 'success' });
        } catch (error) {
            setNotification({ message: 'Gagal menyimpan perubahan.', type: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    if (isLoading) return <div className="text-center p-8">Memuat data biodata guru...</div>;

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg">
             {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    <div className="space-y-6">
                         <div>
                            <label className="block text-sm font-medium text-gray-700">Nama Lengkap</label>
                            <input type="text" name="fullName" value={formData?.fullName} onChange={handleChange} required className="input"/>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700">NIP</label>
                            <input type="text" name="nip" value={formData?.nip} onChange={handleChange} className="input"/>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700">NIK</label>
                            <input type="text" name="nik" value={formData?.nik} onChange={handleChange} className="input"/>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700">NUPTK</label>
                            <input type="text" name="nuptk" value={formData?.nuptk} onChange={handleChange} className="input"/>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700">Jenis Kelamin</label>
                            <select name="gender" value={formData?.gender} onChange={handleChange} className="input">
                                <option>Laki-laki</option>
                                <option>Perempuan</option>
                            </select>
                        </div>
                    </div>
                     <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Status Kepegawaian</label>
                            <select name="employmentStatus" value={formData?.employmentStatus} onChange={handleChange} className="input">
                                <option>PNS</option><option>PPPK</option><option>GTT/GTY</option><option>Honor Sekolah</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Jabatan</label>
                            <input type="text" name="position" value={formData?.position} onChange={handleChange} required className="input"/>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700">Email</label>
                            <input type="email" name="email" value={formData?.email} onChange={handleChange} className="input"/>
                        </div>
                    </div>
                </div>
                <style>{`.input { margin-top: 0.25rem; display: block; width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #D1D5DB; border-radius: 0.375rem; }`}</style>
                <div className="flex justify-end pt-6 border-t mt-6">
                    <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-400">
                        {isSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default TeacherProfileForm;
