
import { GoogleGenAI, GenerateContentResponse, GenerateContentParameters } from '@google/genai';

/**
 * Mendapatkan daftar API Key dari berbagai kemungkinan sumber environment.
 */
const getApiKeys = (): string[] => {
    // Mencoba process.env (standar) dan import.meta.env (Vite)
    const env = (process.env.API_KEY) || (import.meta as any).env?.VITE_API_KEY || '';
    return env.split(',').map(key => key.trim()).filter(key => key !== '');
};

/**
 * Melakukan pemanggilan ke Gemini AI dengan sistem rotasi API Key.
 * Jika satu kunci terkena limit (quota exhausted), sistem akan mencoba kunci berikutnya.
 */
export const generateContentWithRotation = async (
    params: GenerateContentParameters
): Promise<GenerateContentResponse> => {
    const apiKeys = getApiKeys();

    if (apiKeys.length === 0) {
        throw new Error("API_KEY tidak ditemukan. Silakan hubungkan API Key melalui tombol di Dashboard.");
    }

    let lastError: any = null;

    for (let i = 0; i < apiKeys.length; i++) {
        try {
            // Gunakan variabel process.env.API_KEY sesuai instruksi, 
            // namun secara dinamis diisi dari hasil rotasi.
            const ai = new GoogleGenAI({ apiKey: apiKeys[i] });
            const response = await ai.models.generateContent(params);
            return response;
        } catch (error: any) {
            lastError = error;
            const errorMsg = error.message?.toLowerCase() || '';

            // Jika error adalah "Requested entity was not found", kunci mungkin tidak valid/kadaluarsa
            if (errorMsg.includes('requested entity was not found')) {
                console.error("Kunci API tidak valid atau tidak ditemukan di server Google.");
                continue;
            }

            // Cek limit kuota (429)
            const isQuotaExceeded = errorMsg.includes('429') || 
                                   errorMsg.includes('resource_exhausted') || 
                                   errorMsg.includes('quota');

            if (isQuotaExceeded) {
                console.warn(`API Key ke-${i + 1} mencapai limit. Mencoba kunci berikutnya...`);
                continue;
            } else {
                throw error;
            }
        }
    }

    throw new Error(`Gagal memproses permintaan AI: ${lastError?.message || 'Semua kunci API gagal digunakan'}`);
};
