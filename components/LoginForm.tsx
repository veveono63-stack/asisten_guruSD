
import React, { useState, FormEvent } from 'react';
import { EyeIcon, EyeSlashIcon, ArrowRightCircleIcon, EnvelopeIcon } from './Icons';
import Notification, { NotificationType } from './Notification';
import { loginUser, requestPasswordReset } from '../services/authService';
import { User } from '../types';

interface LoginFormProps {
  onToggleForm: () => void;
  onLoginSuccess: (user: User) => void;
  setIsLoggingIn: (isLoggingIn: boolean) => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onToggleForm, onLoginSuccess, setIsLoggingIn }) => {
  // Login states
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Shared states
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);

  // Forgot Password states
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetIdentifier, setResetIdentifier] = useState('');

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setNotification(null);
    setIsLoggingIn(true);

    // Simulate API call for smoother UX transition
    await new Promise(resolve => setTimeout(resolve, 500));

    const result = await loginUser(identifier, password);
    if (result.success && result.user) {
      setNotification({ message: 'Login berhasil! Mengalihkan ke dasbor...', type: 'success' });
      // Wait for notification to be visible before changing view
      setTimeout(() => onLoginSuccess(result.user!), 1500);
    } else {
      setNotification({ message: result.message, type: 'error' });
      setIsLoading(false);
      setIsLoggingIn(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setNotification(null);

    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const result = await requestPasswordReset(resetIdentifier);
    if (result.success) {
      setNotification({ message: result.message, type: 'success' });
    } else {
      setNotification({ message: result.message, type: 'error' });
    }
    setIsLoading(false);
  };

  if (isForgotPassword) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-4">Lupa Password</h2>
        <p className="text-center text-sm text-gray-600 mb-6">
          Masukkan username atau email Anda untuk menerima link reset password.
        </p>
        {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
        <form onSubmit={handleForgotPasswordSubmit} className="space-y-6">
          <div>
            <label htmlFor="reset-identifier" className="block text-sm font-medium text-gray-700">Username atau Email</label>
            <input
              id="reset-identifier"
              type="text"
              value={resetIdentifier}
              onChange={(e) => setResetIdentifier(e.target.value)}
              className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="Masukkan username atau email Anda"
              required
            />
          </div>
          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors duration-300"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Mengirim...
                </>
              ) : (
                <>
                  <EnvelopeIcon />
                  <span className="ml-2">Kirim Email Reset</span>
                </>
              )}
            </button>
          </div>
        </form>
        <p className="mt-8 text-center text-sm text-gray-600">
          Ingat password Anda?{' '}
          <button onClick={() => { setIsForgotPassword(false); setNotification(null); }} className="font-medium text-indigo-600 hover:text-indigo-500 focus:outline-none">
            Kembali ke Login
          </button>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Masuk ke Akun Anda</h2>
      {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
      <form onSubmit={handleLoginSubmit} className="space-y-6">
        <div>
          <label htmlFor="identifier" className="block text-sm font-medium text-gray-700">Username atau Email</label>
          <input
            id="identifier"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            placeholder="contoh: budi.guru atau budi@email.com"
            required
          />
        </div>
        
        <div>
          <div className="relative">
            <label htmlFor="password"  className="block text-sm font-medium text-gray-700">Password</label>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 top-6 pr-3 flex items-center text-gray-500 hover:text-indigo-600"
              aria-label="Toggle password visibility"
            >
              {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
            </button>
          </div>
           <div className="flex items-center justify-end text-sm mt-2">
                <button
                    type="button"
                    onClick={() => { setIsForgotPassword(true); setNotification(null); }}
                    className="font-medium text-indigo-600 hover:text-indigo-500 focus:outline-none"
                >
                    Lupa Password?
                </button>
            </div>
        </div>

        <div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors duration-300"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Memproses...
              </>
            ) : (
                <>
                    <ArrowRightCircleIcon />
                    <span className="ml-2">Masuk</span>
                </>
            )}
          </button>
        </div>
      </form>

      <p className="mt-8 text-center text-sm text-gray-600">
        Belum punya akun?{' '}
        <button onClick={onToggleForm} className="font-medium text-indigo-600 hover:text-indigo-500 focus:outline-none">
          Daftar di sini
        </button>
      </p>
    </div>
  );
};

export default LoginForm;