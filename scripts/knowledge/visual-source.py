"""Bounded visual inventory/raster adapter. Recognition is delegated to Atlas."""
import io
import json
import re
import sys
import posixpath
import zipfile
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image, ImageOps
import pypdf

Image.MAX_IMAGE_PIXELS = 20_000_000
FULL = [0, 0, 1, 1]
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
S = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
REL = '{http://schemas.openxmlformats.org/package/2006/relationships}'

def block(value, kind='transcript', cells=None, nr=0, nc=0):
    return dict(id='text', kind=kind, nature='transcription', origin='native', text=value, bbox=FULL,
                cells=cells or [], rows=nr, cols=nc, title='', unit='')

def draft(blocks):
    return dict(blocks=blocks, blank=False, limitations=[])

def locator(key, kind, ordinal, text='', initial=None, **extra):
    return dict(key=key, kind=kind, ordinal=ordinal, width=0, height=0, rotation=0,
                nativeText=text, initial=initial or draft([block(text)] if text.strip() else []), gaps=[], **extra)

def xml(archive, name):
    data=archive.read(name)
    if len(data)>4*1024*1024 or b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
        raise ValueError('visual_invalid_xml')
    return ET.fromstring(data)

def checked_zip(data):
    z=zipfile.ZipFile(io.BytesIO(data))
    infos=z.infolist()
    if len(infos)>2000 or len({i.filename for i in infos})!=len(infos) or sum(i.file_size for i in infos)>32*1024*1024:
        raise ValueError('visual_archive_budget')
    for i in infos:
        if i.flag_bits & 1 or i.filename.startswith('/') or '..' in i.filename.split('/') or '\\' in i.filename:
            raise ValueError('visual_invalid_archive')
    return z

def image(data):
    with Image.open(io.BytesIO(data)) as im:
        if im.format not in ('PNG','JPEG') or getattr(im,'n_frames',1)!=1 or im.width*im.height>20_000_000:
            raise ValueError('visual_image_budget')
        im.load()
        return ImageOps.exif_transpose(im).convert('RGB')

def office(z):
    out=[]
    unsupported_images=0
    parts=sorted(n for n in z.namelist() if re.fullmatch(r'word/(document|header[0-9]+|footer[0-9]+)\.xml|ppt/slides/slide[0-9]+\.xml|xl/worksheets/sheet[0-9]+\.xml', n))
    for part in parts:
        root=xml(z,part)
        parent,base=posixpath.split(part)
        relname=parent+'/_rels/'+base+'.rels'
        links={}
        if relname in z.namelist():
            for rel in xml(z,relname):
                if rel.tag==REL+'Relationship' and rel.get('TargetMode','Internal')=='Internal':
                    target=posixpath.normpath(posixpath.join(parent,rel.get('Target','')))
                    if not target.startswith('../') and target in z.namelist():
                        links[rel.get('Id')]=target
        for n,blip in enumerate(root.iter(A+'blip'),1):
            target=links.get(blip.get(R+'embed'))
            if not target: continue
            if not target.lower().endswith(('.png','.jpg','.jpeg')):
                unsupported_images+=1
                continue
            im=image(z.read(target))
            item=locator('image:'+part+':'+str(n),'office_image',len(out)+1,part=part+'#image='+str(n)+'#media='+target)
            item['width'],item['height']=im.size
            out.append(item)
        tables=list(root.iter(W+'tbl'))+list(root.iter(A+'tbl'))
        for n,table in enumerate(tables,1):
            ns=W if table.tag==W+'tbl' else A
            trs=table.findall(ns+'tr'); cells=[]; max_col=0; merges={}
            for ri,tr in enumerate(trs):
                ci=0
                for tc in tr.findall(ns+'tc'):
                    value=' '.join((e.text or '') for e in tc.iter(ns+'t'))
                    if ns==W:
                        props=tc.find(W+'tcPr'); gs=props.find(W+'gridSpan') if props is not None else None
                        cs=int(gs.get(W+'val','1')) if gs is not None else 1
                        vm=props.find(W+'vMerge') if props is not None else None
                        if vm is not None and vm.get(W+'val','continue')=='continue':
                            prev=merges.get(ci)
                            if prev is None or prev['row']+prev['rowSpan']!=ri or prev['colSpan']!=cs:
                                raise ValueError('visual_invalid_table')
                            prev['rowSpan']+=1
                            ci+=cs;continue
                        rs=1
                    else:
                        cs=int(tc.get('gridSpan','1'));rs=int(tc.get('rowSpan','1'))
                        if tc.get('hMerge')=='1' or tc.get('vMerge')=='1': ci+=1;continue
                    c=dict(row=ri,col=ci,rowSpan=rs,colSpan=cs,text=value,header=ri==0,locator=part+'#table='+str(n)+'#row='+str(ri+1)+'#col='+str(ci+1))
                    cells.append(c)
                    if ns==W:
                        merges.pop(ci,None)
                        if vm is not None: merges[ci]=c
                    ci+=cs
                max_col=max(max_col,ci)
            if cells:out.append(locator('table:'+part+':'+str(n),'office_table',len(out)+1,initial=draft([block('', 'table',cells,len(trs),max_col)]),part=part+'#table='+str(n)))
        if part.startswith('xl/worksheets/'):
            # Literal authored cells only. Formula expressions are preserved, never executed.
            shared=[]
            if 'xl/sharedStrings.xml' in z.namelist(): shared=[''.join(e.text or '' for e in si.iter(S+'t')) for si in xml(z,'xl/sharedStrings.xml').findall(S+'si')]
            values=[]
            for c in root.iter(S+'c'):
                address=c.get('r','')
                if not re.fullmatch(r'[A-Z]{1,3}[1-9][0-9]{0,5}',address):raise ValueError('visual_invalid_cell')
                rown=int(re.search(r'[0-9]+',address).group())-1;coln=0
                for ch in re.search(r'[A-Z]+',address).group():coln=coln*26+ord(ch)-64
                coln-=1
                v=c.find(S+'v');f=c.find(S+'f')
                txt=''.join(e.text or '' for e in c.iter(S+'t')) if c.get('t')=='inlineStr' else (v.text or '') if v is not None else ''
                if c.get('t')=='s':txt=shared[int(txt)]
                if f is not None:txt='='+(f.text or '')
                values.append((rown,coln,txt,address))
            if values:
                minr=min(v[0] for v in values);minc=min(v[1] for v in values);maxr=max(v[0] for v in values);maxc=max(v[1] for v in values)
                if maxr-minr>=200 or maxc-minc>=50 or len(values)>2000:raise ValueError('visual_table_budget')
                cells=[dict(row=r-minr,col=c-minc,rowSpan=1,colSpan=1,text=t,header=r==minr,locator=part+'!'+a) for r,c,t,a in values]
                def addr(s):
                    letters,digits=re.fullmatch(r'([A-Z]+)([0-9]+)',s).groups();col=0
                    for ch in letters:col=col*26+ord(ch)-64
                    return int(digits)-1,col-1
                for merge in root.iter(S+'mergeCell'):
                    first,last=merge.get('ref','').split(':');r,c=addr(first);er,ec=addr(last)
                    anchor=next((x for x in cells if x['row']==r-minr and x['col']==c-minc),None)
                    if anchor is None:raise ValueError('visual_invalid_table')
                    anchor['rowSpan']=er-r+1;anchor['colSpan']=ec-c+1
                    cells=[x for x in cells if x is anchor or not(r-minr<=x['row']<=er-minr and c-minc<=x['col']<=ec-minc)]
                out.append(locator('table:'+part,'office_table',len(out)+1,initial=draft([block('','table',cells,maxr-minr+1,maxc-minc+1)]),part=part))
    if unsupported_images:
        for item in out:item['gaps'].append('unsupported_embedded_image_formats:'+str(unsupported_images))
    if len(out)>300:raise ValueError('visual_asset_budget')
    return out

def main():
    mode,mime,source,folder,key=sys.argv[1:]
    data=Path(source).read_bytes()
    if not data or len(data)>8*1024*1024:raise ValueError('visual_source_budget')
    im=None
    if mime=='application/pdf':
        reader=pypdf.PdfReader(io.BytesIO(data),strict=True)
        if reader.is_encrypted or not 1<=len(reader.pages)<=300:raise ValueError('visual_pdf_budget')
        if mode=='inventory':
            out=[]
            for i,p in enumerate(reader.pages,1):
                txt=p.extract_text() or ''
                if len(txt)>50000:raise ValueError('visual_text_budget')
                item=locator('page:'+str(i),'pdf_page',i,text=txt,page=i)
                item['width']=int(float(p.mediabox.width));item['height']=int(float(p.mediabox.height));item['rotation']=int(p.rotation or 0)
                out.append(item)
            if sum(len(x['nativeText']) for x in out)>2_000_000:raise ValueError('visual_text_budget')
            print(json.dumps(out,ensure_ascii=True));return
        page=int(key.split(':')[1])
        if not 1<=page<=len(reader.pages):raise ValueError('visual_invalid_page')
        subprocess.run(['pdftoppm','-f',str(page),'-l',str(page),'-singlefile','-scale-to','1600','-png',source,str(Path(folder)/'raster')],check=True,timeout=20,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        im=image((Path(folder)/'raster.png').read_bytes())
    elif mime in ('image/png','image/jpeg'):
        im=image(data)
        if mode=='inventory':
            item=locator('image:1','image',1);item['width'],item['height']=im.size
            print(json.dumps([item]));return
    elif mime in ('application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'):
        z=checked_zip(data)
        if mode=='inventory':print(json.dumps(office(z),ensure_ascii=True));return
        if key.startswith('image:'):
            items=office(z);loc=next(x for x in items if x['key']==key);media=loc['part'].split('#media=')[1];im=image(z.read(media))
        else:
            print(json.dumps(dict(image=False)));return
    else:raise ValueError('visual_format_unsupported')
    if mode=='crop':
        x1,y1,x2,y2=map(float,key.split(','))
        if not(0<=x1<x2<=1 and 0<=y1<y2<=1):raise ValueError('visual_invalid_region')
        im=im.crop((int(x1*im.width),int(y1*im.height),max(int(x2*im.width),int(x1*im.width)+1),max(int(y2*im.height),int(y1*im.height)+1)))
    im.thumbnail((1600,1600));im.save(Path(folder)/'image.png','PNG')
    if (Path(folder)/'image.png').stat().st_size>4*1024*1024:raise ValueError('visual_image_budget')
    print(json.dumps(dict(image=True,width=im.width,height=im.height)))

if __name__=='__main__':main()
