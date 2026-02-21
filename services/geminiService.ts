import { GoogleGenAI, GenerateContentResponse, GenerateContentParameters } from '@google/genai';

/**
 * Mendapatkan daftar API Key dari environment variable.
 * Mendukung format satu kunci maupun daftar kunci yang dipisahkan koma.
 */
const getApiKeys = (): string[] => {
    const env = process.env.API_KEY || '';
    return env.split(',').map(key => key.trim()).filter(key => key !== '');
};

/**
 * Melakukan pemanggilan ke Gemini AI dengan sistem rotasi API Key otomatis.
 * Jika satu kunci mencapai batas kuota (429 / RESOURCE_EXHAUSTED), 
 * sistem akan secara otomatis mencoba kunci berikutnya dalam daftar.
 */
export const generateContentWithRotation = async (
    params: GenerateContentParameters
): Promise<GenerateContentResponse> => {
    const apiKeys = getApiKeys();

    if (apiKeys.length === 0) {
        throw new Error("API Key tidak ditemukan di environment variable.");
    }

    let lastError: any = null;

    for (let i = 0; i < apiKeys.length; i++) {
        try {
            // Inisialisasi instance AI dengan kunci saat ini dalam urutan rotasi
            const ai = new GoogleGenAI({ apiKey: apiKeys[i] });
            const response = await ai.models.generateContent(params);
            return response;
        } catch (error: any) {
            lastError = error;
            const errorMsg = error.message?.toLowerCase() || '';

            // Cek apakah error terkait dengan limit kuota (Status 429)
            const isQuotaExceeded = 
                errorMsg.includes('429') || 
                errorMsg.includes('resource_exhausted') || 
                errorMsg.includes('quota') ||
                errorMsg.includes('limit exceeded');

            if (isQuotaExceeded && i < apiKeys.length - 1) {
                console.warn(`API Key ke-${i + 1} mencapai limit kuota. Mencoba kunci berikutnya...`);
                continue; // Lanjut ke iterasi berikutnya (kunci selanjutnya)
            } else {
                // Jika bukan error kuota, atau ini adalah kunci terakhir, lempar errornya
                throw error;
            }
        }
    }

    throw lastError || new Error("Gagal memproses permintaan AI setelah mencoba semua kunci.");
};