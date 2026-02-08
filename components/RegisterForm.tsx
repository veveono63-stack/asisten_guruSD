import React, { useState, FormEvent } from 'react';
import { EyeIcon, EyeSlashIcon, UserPlusIcon, CheckCircleIcon } from './Icons';
import Notification, { NotificationType } from './Notification';
import { registerUser } from '../services/authService';
import { RegistrationData } from '../types';

interface RegisterFormProps {
  onToggleForm: () => void;
  onRegistrationSuccess: (message: string) => void;
  setIsRegistering: (isRegistering: boolean) => void;
}

const RegisterForm: React.FC<RegisterFormProps> = ({ onToggleForm, onRegistrationSuccess, setIsRegistering }) => {
  const [formData, setFormData] = useState<RegistrationData>({
    fullName: '',
    schoolName: '',
    className: 'Kelas I',
    email: '',
    username: '',
    password: '',
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setNotification(null);

    if (formData.password !== confirmPassword) {
      setNotification({ message: 'Password dan Ulangi Password tidak cocok.', type: 'error' });
      return;
    }
    
    setIsLoading(true);
    setIsRegistering(true); // Memberi tahu App bahwa proses registrasi dimulai

    // Simulate API call for smoother UX
    await new Promise(resolve => setTimeout(resolve, 500));

    const result = await registerUser(formData);
    setIsLoading(false);

    if (result.success) {
        // onRegistrationSuccess akan menangani setIsRegistering(false)
        onRegistrationSuccess(result.message);
    } else {
        setNotification({ message: result.message, type: 'error' });
        setIsRegistering(false); // Nonaktifkan flag jika registrasi gagal
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Buat Akun Baru</h2>
      {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Nama Lengkap</label>
              <input name="fullName" type="text" value={formData.fullName} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Nama SD</label>
              <input name="schoolName" type="text" value={formData.schoolName} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
            </div>
        </div>

        <div>
            <label className="block text-sm font-medium text-gray-700">Guru Kelas</label>
            <select name="className" value={formData.className} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                {['Kelas I', 'Kelas II', 'Kelas III', 'Kelas IV', 'Kelas V', 'Kelas VI'].map(cls => <option key={cls} value={cls}>{cls}</option>)}
            </select>
        </div>

        <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input name="email" type="email" value={formData.email} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
        </div>

        <div>
            <label className="block text-sm font-medium text-gray-700">Username</label>
            <input name="username" type="text" value={formData.username} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
        </div>
        
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700">Password</label>
          <input name="password" type={showPassword ? 'text' : 'password'} value={formData.password} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 top-6 pr-3 flex items-center text-gray-500 hover:text-indigo-600">
            {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
          </button>
        </div>
        
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700">Ulangi Password</label>
          <input type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
          <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute inset-y-0 right-0 top-6 pr-3 flex items-center text-gray-500 hover:text-indigo-600">
            {showConfirmPassword ? <EyeSlashIcon /> : <EyeIcon />}
          </button>
        </div>

        <div>
          <button type="submit" disabled={isLoading} className="w-full mt-4 flex justify-center items-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors duration-300">
             {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Mendaftar...
              </>
            ) : (
                <>
                    <UserPlusIcon />
                    <span className="ml-2">Daftar Akun Baru</span>
                </>
            )}
          </button>
        </div>
      </form>

      <p className="mt-6 text-center text-sm text-gray-600">
        Sudah punya akun?{' '}
        <button onClick={onToggleForm} className="font-medium text-indigo-600 hover:text-indigo-500 focus:outline-none">
          Masuk di sini
        </button>
      </p>
    </div>
  );
};

export default RegisterForm;