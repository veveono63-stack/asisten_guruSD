
import React, { useState, useEffect, FormEvent } from 'react';
import { SchoolIdentity } from '../types';
import { getSchoolIdentity, updateSchoolIdentity } from '../services/adminService';
import Notification, { NotificationType } from './Notification';

interface SchoolIdentityFormProps {
    selectedClass: string;
    selectedYear: string;
    userId?: string; // Opsional, ada jika diakses oleh Guru
    registeredSchoolName?: string; // Nama sekolah dari data pendaftaran user
    onNameChange?: (newName: string) => void; // Callback untuk update sidebar dashboard
}

const defaultIdentity: SchoolIdentity = {
    schoolName: '',
    npsn: '', nss: '', address: '', postalCode: '', phone: '',
    subdistrict: '', district: '', city: '', province: '',
    website: '', email: '', principalName: '', principalNip: '',
};

const SchoolIdentityForm: React.FC<SchoolIdentityFormProps> = ({ selectedClass, selectedYear, userId, registeredSchoolName, onNameChange }) => {
    const [formData, setFormData] = useState<SchoolIdentity | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);

    useEffect(() => {
        const fetchIdentity = async () => {
            try {
                const identity = await getSchoolIdentity(userId);
                if (identity) {
                    setFormData(identity);
                } else {
                    // Jika data belum ada di database privat guru, gunakan default 
                    // tapi timpa Nama Sekolah dengan data pendaftaran
                    setFormData({
                        ...defaultIdentity,
                        schoolName: registeredSchoolName || 'SDN Contoh'
                    });
                }
            } catch (error) {
                setNotification({ message: 'Gagal memuat data identitas sekolah.', type: 'error' });
                setFormData({
                    ...defaultIdentity,
                    schoolName: registeredSchoolName || 'SDN Contoh'
                });
            } finally {
                setIsLoading(false);
            }
        };
        fetchIdentity();
    }, [userId, registeredSchoolName]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (formData) {
            setFormData({ ...formData, [e.target.name]: e.target.value });
        }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!formData) return;
        setIsSubmitting(true);
        try {
            await updateSchoolIdentity(formData, userId);
            setNotification({ message: 'Identitas sekolah berhasil diperbarui.', type: 'success' });
            
            // Beritahu dashboard jika nama sekolah berubah
            if (onNameChange) {
                onNameChange(formData.schoolName);
            }
        } catch (error) {
            setNotification({ message: 'Gagal menyimpan perubahan.', type: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    if (isLoading) return <div className="text-center p-8">Memuat data...</div>;

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg">
             {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    <div className="space-y-6">
                         <div>
                            <label className="block text-sm font-medium text-gray-700">Nama Sekolah</label>
                            <input type="text" name="schoolName" value={formData?.schoolName} onChange={handleChange} className="input" placeholder="Masukkan Nama Sekolah"/>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700">NPSN</label>
                            <input type="text" name="npsn" value={formData?.npsn} onChange={handleChange} className="input"/>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700">NSS</label>
                            <input type="text" name="nss" value={formData?.nss} onChange={handleChange} className="input"/>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700">Alamat Sekolah</label>
                            <input type="text" name="address" value={formData?.address} onChange={handleChange} className="input"/>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700">Kode Pos</label>
                            <input type="text" name="postalCode" value={formData?.postalCode} onChange={handleChange} className="input"/>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700">Telepon</label>
                            <input type="tel" name="phone" value={formData?.phone} onChange={handleChange} className="input"/>
                        </div>
                    </div>
                     <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Kelurahan</label>
                            <input type="text" name="subdistrict" value={formData?.subdistrict} onChange={handleChange} className="input"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Kecamatan</label>
                            <input type="text" name="district" value={formData?.district} onChange={handleChange} className="input"/>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700">Kabupaten/Kota</label>
                            <input type="text" name="city" value={formData?.city} onChange={handleChange} className="input"/>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700">Provinsi</label>
                            <input type="text" name="province" value={formData?.province} onChange={handleChange} className="input"/>
                        </div>
                        <div className="pt-6 border-t">
                            <h3 className="text-lg font-medium text-gray-900">Kepala Sekolah</h3>
                             <div className="mt-4">
                                <label className="block text-sm font-medium text-gray-700">Nama Kepala Sekolah</label>
                                <input type="text" name="principalName" value={formData?.principalName} onChange={handleChange} className="input"/>
                            </div>
                             <div className="mt-4">
                                <label className="block text-sm font-medium text-gray-700">NIP Kepala Sekolah</label>
                                <input type="text" name="principalNip" value={formData?.principalNip} onChange={handleChange} className="input"/>
                            </div>
                        </div>
                    </div>
                </div>
                <style>{`.input { margin-top: 0.25rem; display: block; width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #D1D5DB; border-radius: 0.375rem; }`}</style>
                <div className="flex justify-end pt-6 border-t">
                    <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-400">
                        {isSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default SchoolIdentityForm;
