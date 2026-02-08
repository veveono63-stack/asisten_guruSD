import { GoogleGenAI, GenerateContentResponse, GenerateContentParameters } from '@google/genai';

/**
 * A wrapper for generateContent that uses process.env.API_KEY.
 * @param params The parameters for the generateContent call.
 * @returns A promise that resolves with the GenerateContentResponse.
 */
export const generateContentWithRotation = async (
    params: GenerateContentParameters
): Promise<GenerateContentResponse> => {
    /* COMMENT: Obtained API Key exclusively from process.env.API_KEY as per initialization guidelines */
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    const response = await ai.models.generateContent(params);
    return response;
};
