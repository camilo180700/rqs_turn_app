import streamlit as st
from streamlit_gsheets import GSheetsConnection
import pandas as pd
from datetime import datetime

# ---------------- Config ----------------
MEMBERS = ["Fer", "Dani", "Camilo", "Majo", "Lini", "Estefi"]
CLIENTS = ["Church's Chicken", "John Deere", "TNZ", "Mazda", "Lufthansa",
           "Swiss", "Australian", "Unilever", "Wendy's", "Unilever Commerce"]
PRIORITIES = ["Low", "Medium", "High"]
PRIO_ICON = {"Low": "🟢", "Medium": "🟠", "High": "🔴"}
PRIO_CLASS = {"Low": "pill-low", "Medium": "pill-medium", "High": "pill-high"}

MONTHS = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"]
def fmt_time(d):
    return f"{d.day:02d} {MONTHS[d.month-1]} {d.hour:02d}:{d.minute:02d}"

def H(s):
    return "\n".join(line.strip() for line in s.strip().split("\n"))

# ---------------- Conexión a Google Sheets ----------------
conn = st.connection("gsheets", type=GSheetsConnection)

def load_history():
    try:
        df = conn.read(worksheet="historial", ttl=0)
        df = df.dropna(how="all")  # quita filas vacías
        return df
    except Exception:
        return pd.DataFrame(columns=["member", "client", "priority", "time"])

def load_turn_index():
    try:
        df = conn.read(worksheet="estado", ttl=0)
        return int(df.iloc[0]["turn_index"])
    except Exception:
        return 0

def save_history(df):
    conn.update(worksheet="historial", data=df)

def save_turn_index(idx):
    conn.update(worksheet="estado", data=pd.DataFrame([{"turn_index": int(idx)}]))

# ---------------- Page ----------------
st.set_page_config(page_title="Turnos RQ's", page_icon="🎟️", layout="wide")

# ---------------- CSS ----------------
st.markdown("""
<style>
  .stApp { background: #f1f5f9; }
  .block-container { padding-top: 2.5rem; padding-bottom: 3rem; max-width: 1080px; }
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
  .turn-card {
    background: linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);
    color: #fff !important; border: none;
    box-shadow: 0 10px 26px rgba(79,70,229,.35);
  }
  .turn-card .label { color: rgba(255,255,255,.85) !important; }
  .turn-name { font-size: 42px; font-weight: 800; line-height: 1.1; color:#fff !important; }
  .turn-hint { margin-top: 8px; opacity: .9; font-size: 14px; color:#fff !important; }
  .last-client { font-size: 20px; font-weight: 700; color:#0f172a !important; }
  .last-meta { display: flex; align-items: center; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
  .meta-text { color: #64748b !important; font-size: 14px; }
  .empty { color: #94a3b8 !important; font-style: italic; }
  .pill { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; display:inline-block; }
  .pill-low { background: #dcfce7; color: #16a34a !important; }
  .pill-medium { background: #fef3c7; color: #b45309 !important; }
  .pill-high { background: #fee2e2; color: #dc2626 !important; }
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
  .stats { display: flex; gap: 10px; flex-wrap: wrap; margin: 4px 0; }
  .stat-chip {
    background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;
    padding: 10px 16px; font-size: 13px; text-align: center; color:#64748b !important; min-width:60px;
  }
  .stat-chip b { display: block; font-size: 20px; color: #4f46e5 !important; margin-bottom:2px; }
  .hist-row {
    display: flex; align-items: center; gap: 12px; padding: 12px 0;
    border-bottom: 1px solid #f1f5f9; color:#0f172a !important;
  }
  .hist-row:last-child { border-bottom: none; }
  .hist-member { font-weight: 700; min-width: 64px; color:#0f172a !important; }
  .hist-client { flex: 1; color:#334155 !important; }
  .hist-time { color: #94a3b8 !important; font-size: 12px; min-width: 90px; text-align: right; }
  div[data-testid="stForm"] { border: none; padding: 0; }
  h1, .page-title { color:#0f172a !important; }
</style>
""", unsafe_allow_html=True)

# ---------------- Cargar datos desde la nube ----------------
hist_df = load_history()
turn_index = load_turn_index()
next_person = MEMBERS[turn_index % len(MEMBERS)]

# Convertir historial a lista de dicts (más reciente primero)
history = hist_df.to_dict("records") if not hist_df.empty else []

st.markdown("<h1 class='page-title'>🎟️ Turnos para tomar RQ's</h1>", unsafe_allow_html=True)
st.markdown("<p style='color:#64748b;margin-top:-8px;'>Rotación del equipo · datos compartidos en tiempo real.</p>", unsafe_allow_html=True)

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
    if history:
        l = history[0]
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
            new_row = pd.DataFrame([{
                "member": next_person, "client": client,
                "priority": priority, "time": fmt_time(datetime.now())
            }])
            # Nueva fila al inicio (más reciente primero)
            updated = pd.concat([new_row, hist_df], ignore_index=True)
            save_history(updated)
            save_turn_index((turn_index + 1) % len(MEMBERS))
            st.cache_data.clear()
            st.rerun()

# ---------------- Fila inferior ----------------
colA, colB = st.columns([1, 1.6])

with colA:
    rot = '<div class="card"><div class="label">Orden de rotación</div>'
    for i, m in enumerate(MEMBERS):
        active = (i == turn_index % len(MEMBERS))
        cls = "rot-item active" if active else "rot-item"
        tag = '<span class="rot-next">SIGUIENTE</span>' if active else ""
        rot += f'<div class="{cls}"><span class="rot-num">{i+1}</span><span>{m}</span>{tag}</div>'
    rot += "</div>"
    st.markdown(H(rot), unsafe_allow_html=True)

    bc1, bc2 = st.columns(2)
    if bc1.button("⏭️ Saltar turno", use_container_width=True):
        save_turn_index((turn_index + 1) % len(MEMBERS))
        st.cache_data.clear()
        st.rerun()
    if bc2.button("🗑️ Reiniciar", use_container_width=True):
        save_history(pd.DataFrame(columns=["member", "client", "priority", "time"]))
        save_turn_index(0)
        st.cache_data.clear()
        st.rerun()

with colB:
    counts = {m: 0 for m in MEMBERS}
    for h in history:
        if h["member"] in counts:
            counts[h["member"]] += 1

    block = '<div class="card"><div class="label">Estadísticas por miembro</div><div class="stats">'
    for m in MEMBERS:
        block += f'<div class="stat-chip"><b>{counts[m]}</b>{m}</div>'
    block += '</div>'

    block += '<div class="label" style="margin-top:20px;">Historial</div>'
    if history:
        for h in history:
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