import os
import re
import requests
import threading
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from queue import Queue
import subprocess
import sys
import json
import base64

# --- 組態設定 ---
SRC_DIR = os.path.dirname(__file__)
INDEX_HTML_PATH = os.path.join(SRC_DIR, 'index.html')
STYLE_CSS_PATH = os.path.join(SRC_DIR, 'style.css')
APP_JS_PATH = os.path.join(SRC_DIR, 'app.js')
SOUND_FILE_PATH = os.path.join(SRC_DIR, 'CorrectSound.mp3')
HANZI_WRITER_CDN_URL = 'https://cdn.jsdelivr.net/npm/hanzi-writer@3.5/dist/hanzi-writer.min.js'

def open_path(path):
    """Opens a file or directory in the default application."""
    try:
        if sys.platform == "win32":
            os.startfile(path)
        elif sys.platform == "darwin":
            subprocess.run(["open", path])
        else:
            subprocess.run(["xdg-open", path])
    except Exception as e:
        print(f"Failed to open path: {e}")

def create_package(characters_to_pack, output_filepath, status_queue):
    """
    重構後的核心打包邏輯，現在加入了音效的內嵌處理。
    """
    try:
        # 1. 讀取所有來源檔案
        status_queue.put("狀態：讀取來源檔案...")
        with open(INDEX_HTML_PATH, 'r', encoding='utf-8') as f: html_template = f.read()
        with open(APP_JS_PATH, 'r', encoding='utf-8') as f: app_js_content = f.read()
        with open(STYLE_CSS_PATH, 'r', encoding='utf-8') as f: style_content = f.read()
        
        # 2. 處理音效檔案，轉換為 Data URI
        status_queue.put("狀態：處理音效檔案...")
        sound_data_uri = ""
        try:
            with open(SOUND_FILE_PATH, 'rb') as f:
                sound_binary = f.read()
            sound_base64 = base64.b64encode(sound_binary).decode('ascii')
            sound_data_uri = f"data:audio/mpeg;base64,{sound_base64}"
            status_queue.put("狀態：音效檔案已成功內嵌。")
        except FileNotFoundError:
            status_queue.put(f"警告：找不到音效檔案，音效將無法播放。")
        except Exception as e:
            status_queue.put(f"警告：處理音效時發生錯誤：{e}")

        # 3. 處理 Hanzi Writer 函式庫
        status_queue.put("狀態：從網路獲取核心函式庫...")
        try:
            response = requests.get(HANZI_WRITER_CDN_URL, timeout=10)
            response.raise_for_status()
            hanzi_writer_lib = response.text
            status_queue.put("狀態：核心函式庫獲取成功。")
        except requests.exceptions.RequestException as e:
            status_queue.put(f"警告：無法下載函式庫 ({e})。將維持 CDN 連結。")
            hanzi_writer_lib = None

        # 4. 以樣板為基礎，開始組合最終 HTML
        modified_html = html_template

        # 5. 替換 Audio 標籤
        if sound_data_uri:
            modified_html = re.sub(
                r'(<audio id="completion-sound".*?src=")[^"]*(".*?</audio>)',
                f'\\1{sound_data_uri}\\2',
                modified_html
            )
        else:
            modified_html = re.sub(r'<audio id="completion-sound".*?</audio>', '', modified_html)

        # 6. 注入預載資料 (確保在 app.js 執行前定義)
        escaped_chars = json.dumps(characters_to_pack, ensure_ascii=False)
        data_script = f"""<script>
      window.preloadedCharacters = {escaped_chars};
    </script>"""
        modified_html = modified_html.replace(
            '<script src="app.js"></script>',
            f'{data_script}\n    <script src="app.js"></script>'
        )

        # 7. 內嵌 CSS 和 JS
        modified_html = modified_html.replace('<link rel="stylesheet" href="style.css">', f'<style>{style_content}</style>')
        modified_html = modified_html.replace('<script src="app.js"></script>', f'<script>{app_js_content}</script>')

        # 8. 內嵌 Hanzi Writer 函式庫
        if hanzi_writer_lib:
            modified_html = modified_html.replace(f'<script src="{HANZI_WRITER_CDN_URL}"></script>', f'<script>{hanzi_writer_lib}</script>')

        # 9. 修改 Header 內容
        header_pattern = re.compile(r'(<header class="app-header">)(.*?)(</header>)', re.DOTALL)
        original_header_match = header_pattern.search(modified_html)
        new_header_content = f'<h1>生字練習：{characters_to_pack[:25]}</h1>'
        if original_header_match:
            original_header_inner_html = original_header_match.group(2)
            theme_switch_match = re.search(r'(<div class="theme-switch-container">.*?</div>)', original_header_inner_html, re.DOTALL)
            if theme_switch_match:
                new_header_content += '\n' + theme_switch_match.group(1)
            modified_html = header_pattern.sub(f'\\1{new_header_content}\\3', modified_html)

        # 10. 寫入最終的單一 HTML 檔案
        status_queue.put("狀態：寫入最終檔案...")
        with open(output_filepath, 'w', encoding='utf-8') as f:
            f.write(modified_html)
        
        status_queue.put(f"成功！已儲存至: {os.path.basename(output_filepath)}")
        status_queue.put("DONE_SUCCESS")

    except Exception as e:
        status_queue.put(f"錯誤：{e}")
        status_queue.put("DONE_ERROR")


class PackagerGUI(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("生字練習網頁打包工具")
        self.geometry("500x320")
        self.resizable(False, False)

        self.status_queue = Queue()
        self.output_filepath = ""
        self.last_saved_dir = "."

        # --- UI Elements ---
        main_frame = ttk.Frame(self, padding="15")
        main_frame.pack(fill=tk.BOTH, expand=True)

        ttk.Label(main_frame, text="請輸入或貼上本課生字：").pack(fill=tk.X, pady=(0, 5))
        self.char_text = tk.Text(main_frame, height=5, font=("Microsoft JhengHei UI", 11))
        self.char_text.pack(fill=tk.X, expand=True)
        self.char_text.focus()

        path_frame = ttk.Frame(main_frame)
        path_frame.pack(fill=tk.X, pady=10)
        self.filepath_label = ttk.Label(path_frame, text="儲存位置：(尚未選擇)", style="TLabel")
        self.filepath_label.pack(side=tk.LEFT, fill=tk.X, expand=True)
        self.browse_button = ttk.Button(path_frame, text="選擇...", command=self.ask_save_as)
        self.browse_button.pack(side=tk.LEFT, padx=(10, 0))

        action_frame = ttk.Frame(main_frame)
        action_frame.pack(fill=tk.X, pady=5)
        
        self.package_button = ttk.Button(action_frame, text="開始打包", command=self.start_packaging)
        self.package_button.pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=5)
        
        self.open_folder_button = ttk.Button(action_frame, text="打開文件夾", state=tk.DISABLED, command=self.open_save_folder)
        self.open_folder_button.pack(side=tk.LEFT, padx=(10, 0), ipady=5)

        self.status_var = tk.StringVar(value="狀態：待命中...")
        status_label = ttk.Label(self, textvariable=self.status_var, relief=tk.SUNKEN, padding="5")
        status_label.pack(side=tk.BOTTOM, fill=tk.X)
        
        self.check_queue()

    def ask_save_as(self):
        path = filedialog.asksaveasfilename(
            title="選擇儲存位置",
            initialfile="書寫練習.html",
            defaultextension=".html",
            filetypes=[("HTML 檔案", "*.html"), ("所有檔案", "*.*")]
        )
        if path:
            self.output_filepath = path
            self.last_saved_dir = os.path.dirname(path)
            self.filepath_label.config(text=f"儲存位置：{os.path.basename(path)}")
            self.open_folder_button.config(state=tk.DISABLED)

    def start_packaging(self):
        chars = self.char_text.get("1.0", tk.END).strip().replace('\n', '')
        if not chars:
            messagebox.showwarning("輸入錯誤", "請先輸入一些生字！")
            return
        if not self.output_filepath:
            messagebox.showwarning("輸入錯誤", "請先選擇儲存位置！")
            return

        self.package_button.config(state=tk.DISABLED)
        self.open_folder_button.config(state=tk.DISABLED)
        self.status_var.set("狀態：準備開始...")

        self.thread = threading.Thread(
            target=create_package,
            args=(chars, self.output_filepath, self.status_queue)
        )
        self.thread.start()

    def check_queue(self):
        try:
            while True:
                msg = self.status_queue.get_nowait()
                if msg == "DONE_SUCCESS":
                    self.package_button.config(state=tk.NORMAL)
                    self.open_folder_button.config(state=tk.NORMAL)
                    final_status = self.status_var.get()
                    messagebox.showinfo("完成", final_status)
                    if self.output_filepath:
                        open_path(self.output_filepath)
                elif msg == "DONE_ERROR":
                    self.package_button.config(state=tk.NORMAL)
                    final_status = self.status_var.get()
                    messagebox.showerror("失敗", final_status)
                else:
                    self.status_var.set(msg)
        except Exception:
            pass
        self.after(100, self.check_queue)
        
    def open_save_folder(self):
        if self.last_saved_dir:
            open_path(self.last_saved_dir)

if __name__ == '__main__':
    app = PackagerGUI()
    app.mainloop()
