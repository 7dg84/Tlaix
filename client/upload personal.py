'''
Cliente encargado de subir registros a la base de datos, a través de la lectura de archivos excel
'''
import pandas as pd
from api import Api
import qrcode
from tkinter import filedialog
import json
from unidecode import unidecode


def gen_qr(no):
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(no)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    img.save(f"qrs/{no}.png")


def main():
    file = filedialog.askopenfilename(title="Selecciona el archivo Excel", filetypes=[
                                      ("Excel files", "*.xlsx *.xls")])
    if not file:
        print("No se seleccionó ningún archivo.")
        return
    df = pd.read_excel(file)
    print(df.columns)
    for index, row in df.iterrows():
        fullName: list = row['NOMBRE'].split(' ')
        pLastName = fullName[0]
        mLastName = fullName[1]
        fullName.pop(0)
        fullName.pop(0)
        name = ' '.join(fullName)
    
        data = json.loads(json.dumps({
            "clave_empleado": str(row['CLAVE']).zfill(8),
            "apellido_paterno": pLastName,
            "apellido_materno": mLastName,
            "nombre": name,
            "plantel": row['Plantel'],
            "telefono": '',
            "correo": 'none@mail.com',
            "nivel_educativo": '',
            "group": "G1"
        }))
    
        # data = json.loads(json.dumps({
        #     "clave_empleado": str(row['CLAVE']).zfill(8),
        #     "apellido_paterno": row['NOMBRE'].split(' '),
        #     "apellido_materno": row['Apellido Materno:'],
        #     "nombre": row['Nombre:'],
        #     "plantel": row['Plantel que representará:'],
        #     "telefono": row['Teléfono de contacto para agregar a grupo de WhatsApp:'],
        #     "correo": row['Dirección de correo electrónico'],
        #     "nivel_educativo": row['Puesto Nominal'],
        #     "group": "G1"
        # }))
        
        # {
        #     "clave_empleado": "00000001",
        #     "apellido_paterno": "Maquez",
        #     "apellido_materno": "Garcia",
        #     "nombre": "Erick",
        #     "plantel": "Chimalhuacan",
        #     "fecha_ingreso": "2026-04-27",
        #     "foto": "http://localhost:8000/media/personal/fotos/ChatGPT_Image_2_may_2026_06_44_32_p.m._r1_c1.png",
        #     "curp": "SIMJ080926HMCLRHA8",
        #     "telefono": "5555555555",
        #     "correo": "mail@exmaple.com",
        #     "nivel_educativo": "Licenciatura",
        #     "group": "G"
        # }
        print(data)
        # gen_qr(data['clave_empleado'])
        api = Api("http://tlaix.smart-food.cc",
                  jwt_token="1490f31d590620a38ad1edbe5dc917fe1c443cfe")
        print(api.upload_personal(data), data, end="\n\n")


if __name__ == "__main__":
    main()
