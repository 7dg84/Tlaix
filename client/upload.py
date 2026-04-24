'''
Cliente encargado de subir registros a la base de datos, a través de la lectura de archivos excel
'''
import pandas as pd
from api import Api
import qrcode
from tkinter import filedialog


def gen_qr(no_control):
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(no_control)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    img.save(f"qrs/{no_control}.png")


def main():
    file = filedialog.askopenfilename(title="Selecciona el archivo Excel", filetypes=[
                                      ("Excel files", "*.xlsx *.xls")])
    if not file:
        print("No se seleccionó ningún archivo.")
        return
    df = pd.read_excel(file)
    for index, row in df.iterrows():
        student_data = {
            "no_control": row['Número de control'],
            "name": row['Paterno']+" "+row['Materno']+" "+row['Nombre'],
            "plantel": row['Plantel'],
            "carrera": row['Especialidad'],
            "turno": row['Turno'],
            "group": row['Grupo']
        }
        gen_qr(student_data['no_control'])
        api = Api("http://127.0.0.1:8000")
        api.upload_student(student_data)
        print(student_data)


if __name__ == "__main__":
    main()
