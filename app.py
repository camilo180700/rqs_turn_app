import streamlit as st
import json, os
from datetime import datetime

# ---------------- Config ----------------
DATA_FILE = "turnos.json"
MEMBERS = ["Fer", "Dani", "Camilo", "Majo", "Lini", "Estefi"]
CLIENTS = ["Church's Chicken", "John Deere", "TNZ", "Mazda", "Lufthansa",
           "Swiss", "Australian", "Unilever", "Wendy's", "Unilever Commerce"]
PRIORITIES = ["Low", "Medium", "High"]
PRIO_ICON = {"Low": "🟢", "Medium": "🟠", "High": "🔴"}
PRIO_CLASS = {"Low": "pill-low", "Medium": "pill-medium", "High": "pill-high"}

MONTHS = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"]
def fmt_time(d):
    return f"{d.day:02d} {MONTHS[d.month-1]} {d.hour:02d}:{d.minute:02d}"

# Quita la sangría de cada línea para que Streamlit NO lo trate como bloque de código
def H(s):
    return "\n".join(line.strip() for line in s.strip().split("\n"))

def load_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"turn_index": 0, "history": []}

def save_data(d):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)

# ---------------- Page ----------------
st.set_page_config(page_title="Turnos RQ's", page_icon="🎟️", layout="wide")

# ---------------- CSS ----------------
st.markdown("""
<style>
  /* Fondo general */
  .stApp { background: #f1f5f9; }
  .block-container { padding-top: 2.5rem; padding-bottom: 3rem; max-width: 1080px; }

  /* Tarjetas */
  .card {
    background: #ffffff; border-radius: 16px; padding: 22px;
    box-shadow: 0 4px 14px rgba(15,23,42,.06); border: 1px solid #eef0f3;
    margin-bottom: 16px; color: #0f172a;
  }
  .card * { color: inherit; }
  .label {
    font-size: 12px; font-weight: 700; color: #64748b !important;
    text-transform: uppercase; letter-spacing: .6px; margin-bottom: 10px;
  }

  /* Tarjeta de turno (gradiente morado) */
  .turn-card {
    background: linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);
    color: #fff !important; border: none;
    box-shadow: 0 10px 26px rgba(79,70,229,.35);
  }
  .turn-card .label { color: rgba(255,255,255,.85) !important; }
  .turn-name { font-size: 42px; font-weight: 800; line-height: 1.1; color:#fff !important; }
  .turn-hint { margin-top: 8px; opacity: .9; font-size: 14px; color:#fff !important; }

  /* Última RQ */
  .last-client { font-size: 20px; font-weight: 700; color:#0f172a !important; }
  .last-meta { display: flex; align-items: center; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
  .meta-text { color: #64748b !important; font-size: 14px; }
  .empty { color: #94a3b8 !important; font-style: italic; }

  /* Píldoras de prioridad */
  .pill { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; display:inline-block; }
  .pill-low { background: #dcfce7; color: #16a34a !important; }
  .pill-medium { background: #fef3c7; color: #b45309 !important; }
  .pill-high { background: #fee2e2; color: #dc2626 !important; }

  /* Rotación */
  .rot-item {
    display: flex; align-items: center; gap: 12px; padding: 11px 10px;
    border-radius: 10px; margin-bottom: 2px; color:#334155 !important; font-weight: 500;
  }
  .rot-item.active { background: #eef2ff; color:#1e1b4b !important; font-weight: 700; }
  .rot-num {
    width: 26px; height: 26px; border-radius: 50%;
    background: #e2e8f0; color: #64748b !important; display: inline-flex;
    align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink:0;
  }
  .rot-item.active .rot-num { background: #4f46e5; color: #fff !important; }
  .rot-next { margin-left: auto; font-size: 11px; color: #4f46e5 !important; font-weight: 800; letter-spacing:.5px; }

  /* Estadísticas */
  .stats { display: flex; gap: 10px; flex-wrap: wrap; margin: 4px 0; }
  .stat-chip {
    background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;
    padding: 10px 16px; font-size: 13px; text-align: center; color:#64748b !important; min-width:60px;
  }
  .stat-chip b { display: block; font-size: 20px; color: #4f46e5 !important; margin-bottom:2px; }

  /* Historial */
  .hist-row {
    display: flex; align-items: center; gap: 12px; padding: 12px 0;
    border-bottom: 1px solid #f1f5f9; color:#0f172a !important;
  }
  .hist-row:last-child { border-bottom: none; }
  .hist-member { font-weight: 700; min-width: 64px; color:#0f172a !important; }
  .hist-client { flex: 1; color:#334155 !important; }
  .hist-time { color: #94a3b8 !important; font-size: 12px; min-width: 90px; text-align: right; }

  /* Quitar el borde feo del form */
  div[data-testid="stForm"] { border: none; padding: 0; }

  /* Títulos */
  h1, .page-title { color:#0f172a !important; }
</style>
""", unsafe_allow_html=True)

data = load_data()
next_person = MEMBERS[data["turn_index"] % len(MEMBERS)]

# 👇 LÍNEAS CORREGIDAS: comillas dobles por fuera, simples por dentro
st.markdown("<h1 class='page-title'>🎟️ Turnos para tomar RQ's</h1>", unsafe_allow_html=True)
st.markdown("<p style='color:#64748b;margin-top:-8px;'>Rotación del equipo, prioridad y registro de solicitudes.</p>", unsafe_allow_html=True)

# ---------------- Fila superior ----------------
col1, col2 = st.columns(2)
with col1:
    st.markdown(H(f"""
    <div class="card turn-card">
    <div class="label">Le toca a</div>
    <div class="turn-name">👉 {next_person}</div>
    <div class="turn-hint">Siguiente en la rotación</div>
    </div>
    """), unsafe_allow_html=True)

with col2:
    if data["history"]:
        l = data["history"][0]
        last_inner = (
            f'<div class="last-client">{l["client"]}</div>'
            f'<div class="last-meta">'
            f'<span class="pill {PRIO_CLASS[l["priority"]]}">{PRIO_ICON[l["priority"]]} {l["priority"]}</span>'
            f'<span class="meta-text">por {l["member"]} · {l["time"]}</span>'
            f'</div>'
        )
    else:
        last_inner = '<span class="empty">Aún no hay registros</span>'
    st.markdown(H(f'<div class="card"><div class="label">Última RQ tomada</div>{last_inner}</div>'),
                unsafe_allow_html=True)

# ---------------- Registrar nueva RQ ----------------
with st.container(border=True):
    st.markdown('<div class="label">Registrar nueva RQ</div>', unsafe_allow_html=True)
    with st.form("nueva_rq"):
        fc1, fc2, fc3 = st.columns([2, 1.3, 1])
        client = fc1.selectbox("Cliente", CLIENTS)
        priority = fc2.selectbox("Prioridad (la determinan ustedes)", PRIORITIES, index=1)
        fc3.markdown('<div style="height:28px"></div>', unsafe_allow_html=True)
        submitted = fc3.form_submit_button(f"✅ {next_person} toma RQ", use_container_width=True)
        if submitted:
            data["history"].insert(0, {
                "member": next_person, "client": client, "priority": priority,
                "time": fmt_time(datetime.now())
            })
            data["turn_index"] = (data["turn_index"] + 1) % len(MEMBERS)
            save_data(data)
            st.rerun()

# ---------------- Fila inferior ----------------
colA, colB = st.columns([1, 1.6])

with colA:
    rot = '<div class="card"><div class="label">Orden de rotación</div>'
    for i, m in enumerate(MEMBERS):
        active = (i == data["turn_index"] % len(MEMBERS))
        cls = "rot-item active" if active else "rot-item"
        tag = '<span class="rot-next">SIGUIENTE</span>' if active else ""
        rot += f'<div class="{cls}"><span class="rot-num">{i+1}</span><span>{m}</span>{tag}</div>'
    rot += "</div>"
    st.markdown(H(rot), unsafe_allow_html=True)

    bc1, bc2 = st.columns(2)
    if bc1.button("⏭️ Saltar turno", use_container_width=True):
        data["turn_index"] = (data["turn_index"] + 1) % len(MEMBERS)
        save_data(data)
        st.rerun()
    if bc2.button("🗑️ Reiniciar", use_container_width=True):
        save_data({"turn_index": 0, "history": []})
        st.rerun()

with colB:
    counts = {m: 0 for m in MEMBERS}
    for h in data["history"]:
        if h["member"] in counts:
            counts[h["member"]] += 1

    block = '<div class="card"><div class="label">Estadísticas por miembro</div><div class="stats">'
    for m in MEMBERS:
        block += f'<div class="stat-chip"><b>{counts[m]}</b>{m}</div>'
    block += '</div>'

    block += '<div class="label" style="margin-top:20px;">Historial</div>'
    if data["history"]:
        for h in data["history"]:
            block += (
                f'<div class="hist-row">'
                f'<span class="hist-member">{h["member"]}</span>'
                f'<span class="hist-client">{h["client"]}</span>'
                f'<span class="pill {PRIO_CLASS[h["priority"]]}">{PRIO_ICON[h["priority"]]} {h["priority"]}</span>'
                f'<span class="hist-time">{h["time"]}</span>'
                f'</div>'
            )
    else:
        block += '<span class="empty">Registra una RQ para empezar.</span>'
    block += "</div>"
    st.markdown(H(block), unsafe_allow_html=True)