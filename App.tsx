
import React, { useState, useEffect } from 'react';
import LoginForm from './components/LoginForm';
import RegisterForm from './components/RegisterForm';
import AdminDashboard from './components/AdminDashboard';
import TeacherDashboard from './components/TeacherDashboard';
import { onAuthUserChanged, getUserProfile, logoutUser } from './services/authService';
import { User } from './types';
import { CheckCircleIcon } from './components/Icons';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [view, setView] = useState<'login' | 'register' | 'registerSuccess'>('login');
  const [successMessage, setSuccessMessage] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthUserChanged(async (firebaseUser) => {
      if (isRegistering || isLoggingIn) {
        return;
      }
      
      if (view === 'registerSuccess') {
        setIsAuthLoading(false);
        return;
      }

      if (firebaseUser) {
        try {
            const userProfile = await getUserProfile(firebaseUser.uid);
            setUser(userProfile);
        } catch (error) {
            console.error("Failed to fetch user profile:", error);
            setUser(null);
        }
      } else {
        setUser(null);
      }
      setIsAuthLoading(false);
    });

    return () => unsubscribe();
  }, [view, isRegistering, isLoggingIn]);

  const handleLoginSuccess = (loggedInUser: User) => {
    setUser(loggedInUser);
    setIsLoggingIn(false);
  };
  
  const handleRegistrationSuccess = (message: string) => {
    setSuccessMessage(message);
    setView('registerSuccess');
    setIsRegistering(false);
  };

  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
    setView('login');
  };
  
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <svg className="animate-spin h-10 w-10 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  if (user) {
    if (user.role === 'admin') {
      return <AdminDashboard user={user} onLogout={handleLogout} />;
    } else {
      return <TeacherDashboard user={user} onLogout={handleLogout} />;
    }
  }
  
  if (view === 'registerSuccess') {
      return (
        <div className="min-h-screen bg-gradient-to-br from-blue-100 to-indigo-200 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
            <div className="w-full max-w-md">
                <main className="bg-white rounded-2xl shadow-2xl p-8 text-center transition-all duration-500">
                    <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
                        <CheckCircleIcon className="h-10 w-10 text-green-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">Pendaftaran Berhasil!</h2>
                    <p className="text-gray-600 mb-6">{successMessage}</p>
                    <button
                        onClick={() => setView('login')}
                        className="w-full mt-4 flex justify-center items-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                        Kembali ke Halaman Login
                    </button>
                </main>
            </div>
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-indigo-200 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md">
        <header className="text-center mb-8">
            <h1 className="text-4xl font-bold text-indigo-700 tracking-tight">E-Perangkat Guru SD</h1>
            <p className="text-gray-600 mt-2">Asisten Cerdas untuk Administrasi Pembelajaran Anda</p>
        </header>

        <main className="bg-white rounded-2xl shadow-2xl p-8 transition-all duration-500">
          {view === 'register' ? (
            <RegisterForm onToggleForm={() => setView('login')} onRegistrationSuccess={handleRegistrationSuccess} setIsRegistering={setIsRegistering} />
          ) : (
            <LoginForm onToggleForm={() => setView('register')} onLoginSuccess={handleLoginSuccess} setIsLoggingIn={setIsLoggingIn} />
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
