import os
import requests
import threading
from urllib.parse import urlparse
from time import time, sleep

class Downloader:
    def __init__(self, url, num_threads, output_file=None):
        self.url = url
        self.num_threads = num_threads
        self.output_file = output_file or os.path.basename(urlparse(url).path)
        self.resume_header = 'Range'
        self.session = requests.Session()
        self.downloaded = 0
        self.start_time = None
        self.lock = threading.Lock()

    def get_file_size(self):
        response = self.session.head(self.url)
        return int(response.headers['Content-Length'])

    def download(self, start, end, part):
        headers = {self.resume_header: f'bytes={start}-{end}'}
        response = self.session.get(self.url, headers=headers, stream=True)

        with open(f'{self.output_file}.part{part}', 'wb') as file:
            for chunk in response.iter_content(chunk_size=1024):
                file.write(chunk)
                with self.lock:
                    self.downloaded += len(chunk)

    def merge_parts(self):
        with open(self.output_file, 'wb') as output:
            for i in range(self.num_threads):
                part_file = f'{self.output_file}.part{i}'
                with open(part_file, 'rb') as input:
                    output.write(input.read())
                os.remove(part_file)

    def show_progress(self, file_size):
        while self.downloaded < file_size:
            elapsed_time = time() - self.start_time
            progress = (self.downloaded / file_size) * 100
            speed = self.downloaded / elapsed_time / 1024  # in KB/s
            print(f'\rDownload progress: {progress:.2f}% | Speed: {speed:.2f} KB/s', end='')
            sleep(1)

    def start(self):
        file_size = self.get_file_size()
        chunk_size = file_size // self.num_threads

        threads = []
        for i in range(self.num_threads):
            start = i * chunk_size
            end = file_size if i == self.num_threads - 1 else (i + 1) * chunk_size - 1
            thread = threading.Thread(target=self.download, args=(start, end, i))
            threads.append(thread)
            thread.start()

        self.start_time = time()
        progress_thread = threading.Thread(target=self.show_progress, args=(file_size,))
        progress_thread.start()

        for thread in threads:
            thread.join()

        progress_thread.join()
        print('\rDownload progress: 100.00% | Speed: --.-- KB/s')
        self.merge_parts()

if __name__ == '__main__':
    url = input('Enter the file URL: ')
    num_threads = int(input('Enter the number of threads: '))
    output_file = input('Enter the output file name (optional): ')

    downloader = Downloader(url, num_threads, output_file)
    start_time = time()
    downloader.start()
    end_time = time()

    print(f'Download completed in {end_time - start_time:.2f} seconds.')
