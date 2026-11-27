#!/usr/bin/env python3
"""Build an offline-capable, single-SCO SCORM 1.2 package, with no external dependencies."""
from pathlib import Path
import argparse
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("output", type=Path, help="Destination .zip, outside the published site")
args = parser.parse_args()
files = [ROOT / name for name in ["index.html", "panorama.js", "photo-details.js", "tracking.js", "tracking-config.js", "SCORM_GUIDE.md"]]
for folder in ["datos", "panoramas", "photos"]:
    files += sorted(p for p in (ROOT / folder).rglob("*") if p.is_file() and p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"})
paths = [str(p.relative_to(ROOT)) for p in files]
ns = "http://www.imsproject.org/xsd/imscp_rootv1p1p2"
adl = "http://www.adlnet.org/xsd/adlcp_rootv1p2"
ET.register_namespace("", ns)
ET.register_namespace("adlcp", adl)
tag = lambda name: f"{{{ns}}}{name}"
manifest = ET.Element(tag("manifest"), {"identifier": "FIBERLOG_OSP_TRACKING_V1", "version": "1.0"})
metadata = ET.SubElement(manifest, tag("metadata"))
ET.SubElement(metadata, tag("schema")).text = "ADL SCORM"
ET.SubElement(metadata, tag("schemaversion")).text = "1.2"
organizations = ET.SubElement(manifest, tag("organizations"), {"default": "OSP_ORG"})
organization = ET.SubElement(organizations, tag("organization"), {"identifier": "OSP_ORG"})
ET.SubElement(organization, tag("title")).text = "Fiberlog OSP Visual Inspection"
item = ET.SubElement(organization, tag("item"), {"identifier": "OSP_ACTIVITY", "identifierref": "OSP_SCO"})
ET.SubElement(item, tag("title")).text = "OSP Inspection Practice and Response Tracking"
resources = ET.SubElement(manifest, tag("resources"))
resource = ET.SubElement(resources, tag("resource"), {"identifier": "OSP_SCO", "type": "webcontent", f"{{{adl}}}scormtype": "sco", "href": "index.html"})
for path in paths:
    ET.SubElement(resource, tag("file"), {"href": path})
ET.indent(manifest)
manifest_bytes = ET.tostring(manifest, encoding="utf-8", xml_declaration=True)
args.output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(args.output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    archive.writestr("imsmanifest.xml", manifest_bytes)
    for path, source in zip(paths, files):
        if path == "tracking-config.js":
            archive.writestr(path, "window.OSP_TRACKING_CONFIG = { requireLMS: true };\n")
        else:
            archive.write(source, path)
with zipfile.ZipFile(args.output) as archive:
    assert archive.testzip() is None
    parsed = ET.fromstring(archive.read("imsmanifest.xml"))
    assert parsed.find(f".//{tag('resource')}").attrib["href"] in archive.namelist()
    for entry in parsed.findall(f".//{tag('file')}"):
        assert entry.attrib["href"] in archive.namelist(), entry.attrib["href"]
    assert b"requireLMS: true" in archive.read("tracking-config.js")
print(f"Validated {len(paths)} packaged files: {args.output} ({args.output.stat().st_size / 1024**2:.1f} MiB)")
