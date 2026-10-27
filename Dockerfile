# VAULT configurator — local web tool for the USSA Design VAULT archive.
# The archive (STLs + manuals) is NOT in the image: mount the folder you bought at /archive.
FROM python:3.13-slim
# pillow: pypdf needs it to pull the manual pages out of the owner's PDFs for the help pictures
RUN pip install --no-cache-dir numpy pypdf pillow
WORKDIR /app
COPY . /app
ENV VAULT_ARCHIVE=/archive PORT=8765 HOST=0.0.0.0 PYTHONUNBUFFERED=1
VOLUME ["/archive", "/app/cache", "/app/assets", "/app/output", "/app/slicers"]
EXPOSE 8765
CMD ["python", "-X", "utf8", "server.py", "--no-browser"]
