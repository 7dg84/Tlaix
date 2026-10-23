import { toast } from 'react-hot-toast';

function manageError(error: any) {
    if (error.response?.status === 502) toast.error("Error 502");
    if (error.response) {
        // La solicitud se realizó y el servidor respondió con un código de estado
        // que está fuera del rango de 2xx
        console.error('Error response data:', error.response.data);
        console.error('Error response status:', error.response.status);
        console.error('Error response headers:', error.response.headers);
        for (const key in error.response.data) {
            if (Object.prototype.hasOwnProperty.call(error.response.data, key)) {
                const messages = error.response.data[key];
                if (Array.isArray(messages)) {
                    messages.forEach((msg: string) => {
                        toast.error(key + ": " + msg);
                    });
                } else {
                    toast.error(messages);
                }
            } else {
                toast.error('Ocurrió un error en el servidor.');
            }
        }
    } else if (error.request) {
        // La solicitud se realizó pero no se recibió respuesta
        console.error('Error request:', error.request);
        toast.error('No se recibió respuesta del servidor. Por favor, inténtalo de nuevo más tarde.');
    } else {
        // Algo sucedió al configurar la solicitud que provocó un error
        console.error('Error message:', error.message);
        toast.error(`Error: ${error.message}`);
    }
}

export { manageError };