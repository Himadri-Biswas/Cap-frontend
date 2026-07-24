FROM python:3.10-slim

WORKDIR /app

# System deps for PyMuPDF and pdfminer
RUN apt-get update && apt-get install -y \
    libmupdf-dev mupdf mupdf-tools gcc g++ \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install the CPU-only torch build first (HF Spaces CPU tier has no GPU, and
# the default PyPI wheel bundles CUDA runtime libs, ~5-6x larger). Once this
# is satisfied, the general install below won't re-fetch a different torch.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY data/ ./data/

ENV DATA_DIR=data/processed
ENV HF_HOME=/app/.cache

EXPOSE 7860

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
