import tkinter as tk
from tkinter import ttk

def small_caps(texto):
    mapa = {
        "a": "ᴀ", "b": "ʙ", "c": "ᴄ", "d": "ᴅ", "e": "ᴇ",
        "f": "ꜰ", "g": "ɢ", "h": "ʜ", "i": "ɪ", "j": "ᴊ",
        "k": "ᴋ", "l": "ʟ", "m": "ᴍ", "n": "ɴ", "o": "ᴏ",
        "p": "ᴘ", "q": "ǫ", "r": "ʀ", "s": "s", "t": "ᴛ",
        "u": "ᴜ", "v": "ᴠ", "w": "ᴡ", "x": "x", "y": "ʏ",
        "z": "ᴢ"
    }
    return "".join(mapa.get(c.lower(), c) for c in texto)

def convertir():
    texto = entrada.get()
    resultado.set(small_caps(texto))

def copiar():
    root.clipboard_clear()
    root.clipboard_append(resultado.get())

# Ventana principal
root = tk.Tk()
root.title("Small Caps Discord")
root.geometry("400x220")
root.resizable(False, False)

# Variables
entrada = tk.StringVar()
resultado = tk.StringVar()

# Widgets
ttk.Label(root, text="Texto normal:").pack(pady=5)
ttk.Entry(root, textvariable=entrada, font=("Arial", 12)).pack(fill="x", padx=20)

ttk.Button(root, text="Convertir", command=convertir).pack(pady=10)

ttk.Label(root, text="Resultado:").pack()
ttk.Entry(root, textvariable=resultado, font=("Arial", 12), state="readonly").pack(fill="x", padx=20)

ttk.Button(root, text="Copiar", command=copiar).pack(pady=10)

root.mainloop()
()