import subprocess,hashlib,sys
root=sys.argv[1]
out=subprocess.run(["git","ls-files","-z"],cwd=root,capture_output=True).stdout.split(b"\0")
h=hashlib.sha256()
for f in out:
    if not f: continue
    try: h.update(f+b"\0"+open(root.encode()+b"/"+f,"rb").read())
    except FileNotFoundError: h.update(f+b"\0MISSING")
print(h.hexdigest())
