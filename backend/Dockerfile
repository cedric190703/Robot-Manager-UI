FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies including wget for miniconda
RUN apt-get update && apt-get install -y \
    sudo \
    udev \
    wget \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies in the base Python 3.11 environment (for FastAPI)
# This MUST happen before conda installation to avoid PATH conflicts
RUN pip install --no-cache-dir -r requirements.txt

# Install Miniconda
RUN wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O /tmp/miniconda.sh && \
    bash /tmp/miniconda.sh -b -p /opt/conda && \
    rm /tmp/miniconda.sh

# Configure conda to use only conda-forge (avoids Anaconda TOS requirement)
RUN /opt/conda/bin/conda config --system --remove channels defaults || true && \
    /opt/conda/bin/conda config --system --add channels conda-forge && \
    /opt/conda/bin/conda config --system --set channel_priority strict && \
    /opt/conda/bin/conda init bash && \
    /bin/bash -c "source /opt/conda/etc/profile.d/conda.sh && \
    conda create -y -n lerobot python=3.10 && \
    conda clean -afy"

# Clone lerobot repository
RUN git clone https://github.com/huggingface/lerobot.git /opt/lerobot

# Install lerobot dependencies in stages to avoid OOM segfaults during pip install
# Step 1: Install core dependencies (no CUDA)
RUN /bin/bash -c "source /opt/conda/etc/profile.d/conda.sh && \
    conda activate lerobot && \
    pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu"

# Step 2: Install lerobot's other deps (excluding torch which is already installed)
RUN /bin/bash -c "source /opt/conda/etc/profile.d/conda.sh && \
    conda activate lerobot && \
    cd /opt/lerobot && \
    pip install --no-cache-dir feetech-servo-sdk pyserial && \
    pip install --no-cache-dir -e . --no-deps && \
    pip install --no-cache-dir \
      draccus==0.10.0 pyyaml-include huggingface-hub safetensors \
      datasets einops pillow opencv-python-headless \
      gymnasium wandb termcolor imageio imageio-ffmpeg \
      rerun-sdk pyarrow jsonlines av torchcodec accelerate \
      deepdiff diffusers gitpython"

# Copy application code
COPY ./app ./app
COPY ./main.py ./main.py

# Create data directory for SQLite database
RUN mkdir -p /app/data

# Create a non-root user with sudo privileges
RUN useradd -m -s /bin/bash robotuser && \
    echo "robotuser ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers && \
    chown -R robotuser:robotuser /app/data

# Switch to non-root user
USER robotuser

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]