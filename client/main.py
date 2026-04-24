'''
Cliente Secundario de la api, para endpoinds de acceso
'''

from api import Api
import cv2
from pyzbar.pyzbar import decode

def leer_qr_desde_camara():
    captura = cv2.VideoCapture(0)
    if not captura.isOpened():
        raise RuntimeError("No se puede abrir la cámara")

    texto_qr = ""
    try:
        while True:
            ret, frame = captura.read()
            if not ret:
                break

            codigos = decode(frame)
            if codigos:
                texto_qr = codigos[0].data.decode("utf-8")
                break
    finally:
        captura.release()
        cv2.destroyAllWindows()

    return texto_qr

def main():
    api = Api("http://127.0.0.1:8000")
    
    no = leer_qr_desde_camara()
    print(f"No. de control leído: {no}")
    
    print(api.assist(no))
    
if __name__ == "__main__":
    main()