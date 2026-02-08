import * as firebaseAuth from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { User, RegistrationData, AuthResponse } from '../types';

const {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
} = firebaseAuth;

type FirebaseUser = firebaseAuth.User;

const isEmail = (identifier: string) => /\S+@\S+\.\S+/.test(identifier);

export const loginUser = async (identifier: string, password: string): Promise<AuthResponse> => {
    try {
        let email = identifier;
        let userExistsInDB = false;

        // Langkah 1: Tentukan email dan periksa apakah pengguna ada di database kita
        if (isEmail(identifier)) {
            // Pengguna memberikan email. Lakukan query ke koleksi 'users' untuk melihat apakah terdaftar.
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('email', '==', identifier));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                userExistsInDB = true;
            }
        } else {
            // Pengguna memberikan username. Periksa koleksi 'usernames'.
            const usernameRef = doc(db, 'usernames', identifier.toLowerCase());
            const usernameSnap = await getDoc(usernameRef);
            if (usernameSnap.exists()) {
                userExistsInDB = true;
                email = usernameSnap.data().email;
            }
        }

        // Langkah 2: Jika pengguna tidak ada di database kita, hentikan di sini.
        // Sesuai permintaan: 5. Jika username/email tidak ditemukan...
        if (!userExistsInDB) {
            return { success: false, message: 'Username/Email anda tidak ditemukan. Silakan periksa kembali!' };
        }

        // Langkah 3: Pada titik ini, kita tahu pengguna ada. Sekarang, coba masuk.
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Langkah 4: Ambil profil pengguna lengkap
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
            await signOut(auth); // Kasus langka, tapi untuk keamanan
            return { success: false, message: 'Data profil pengguna tidak ditemukan.' };
        }

        const userData = { id: user.uid, ...userDocSnap.data() } as User;

        // Langkah 5: Periksa status akun
        // Sesuai permintaan: 3. Jika status akun belum disetujui...
        if (userData.role !== 'admin' && userData.status === 'pending') {
            await signOut(auth);
            return { success: false, message: 'Pendaftaran akun anda belum disetujui. Silakan hubungi Admin!' };
        }
        
        // Sesuai permintaan: 4. Jika status akun ditolak...
        if (userData.role !== 'admin' && userData.status === 'rejected') {
            await signOut(auth);
            return { success: false, message: 'Pendaftaran akun anda ditolak. Silakan hubungi Admin!' };
        }

        // Sesuai permintaan: 1. Jika username/email dan password benar...
        if (userData.status === 'approved' || userData.role === 'admin') {
            return { success: true, message: 'Login berhasil!', user: userData };
        }

        await signOut(auth); // Fallback jika ada status lain yang tidak valid
        return { success: false, message: 'Status akun tidak valid.' };

    } catch (error: any) {
        // Jika kita sampai di blok catch, berarti signInWithEmailAndPassword gagal.
        // Karena kita sudah memastikan pengguna ada, errornya PASTI karena password salah.
        // Sesuai permintaan: 2. Jika username/email ditemukan tapi password salah...
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
            return { success: false, message: 'Password yang Anda masukkan salah.' };
        }
        if (error.code === 'auth/invalid-email') {
            return { success: false, message: 'Format email tidak valid.'};
        }
        // Fallback error umum
        return { success: false, message: 'Terjadi kesalahan saat login. Silakan coba lagi.' };
    }
};

export const registerUser = async (data: RegistrationData): Promise<AuthResponse> => {
    const usernameRef = doc(db, 'usernames', data.username.toLowerCase());
    const usernameSnap = await getDoc(usernameRef);
    if (usernameSnap.exists()) {
        return { success: false, message: 'Username sudah digunakan oleh akun lain.' };
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
        const user = userCredential.user;

        const newUser: Omit<User, 'id'> = {
            fullName: data.fullName,
            schoolName: data.schoolName,
            className: data.className,
            email: data.email,
            username: data.username,
            status: 'pending',
            role: 'teacher',
        };
        await setDoc(doc(db, 'users', user.uid), newUser);

        await setDoc(doc(db, 'usernames', data.username.toLowerCase()), {
            email: data.email
        });

        // Log the user out immediately to prevent auto-login and redirect
        await signOut(auth);

        return { success: true, message: 'Pendaftaran berhasil! Silakan hubungi Admin untuk persetujuan akun Anda.' };

    } catch (error: any) {
        if (error.code === 'auth/email-already-in-use') {
            return { success: false, message: 'Email sudah digunakan oleh akun lain.' };
        }
        if (error.code === 'auth/weak-password') {
            return { success: false, message: 'Password terlalu lemah. Gunakan minimal 6 karakter.' };
        }
        return { success: false, message: 'Gagal mendaftar. Silakan coba lagi.' };
    }
};


export const requestPasswordReset = async (identifier: string): Promise<AuthResponse> => {
    try {
        let email = identifier;
        if (!isEmail(identifier)) {
            const usernameRef = doc(db, 'usernames', identifier.toLowerCase());
            const usernameSnap = await getDoc(usernameRef);
            if (!usernameSnap.exists()) {
                return { success: false, message: 'Email atau username tidak ditemukan.' };
            }
            email = usernameSnap.data().email;
        }

        await sendPasswordResetEmail(auth, email);
        return { success: true, message: `Email untuk mereset password telah dikirimkan ke ${email}.` };
        
    } catch (error: any) {
        if(error.code === 'auth/invalid-email') {
            return { success: false, message: 'Format email tidak valid.'}
        }
         if(error.code === 'auth/user-not-found'){
              return { success: false, message: 'Email atau username tidak ditemukan.' };
         }
        return { success: true, message: 'Jika akun Anda terdaftar, email untuk mereset password telah dikirimkan.' };
    }
};

export const logoutUser = async (): Promise<void> => {
    await signOut(auth);
};

export const onAuthUserChanged = (callback: (user: FirebaseUser | null) => void) => {
    return onAuthStateChanged(auth, callback);
};

export const getUserProfile = async (uid: string): Promise<User | null> => {
    const userDocRef = doc(db, 'users', uid);
    const userDocSnap = await getDoc(userDocRef);
    if(userDocSnap.exists()) {
        return { id: uid, ...userDocSnap.data() } as User;
    }
    // This might happen if a user exists in Auth but not in Firestore.
    // In a real app, you might want to handle this case more gracefully.
    throw new Error("User profile not found in database.");
}