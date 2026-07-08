import streamlit as st
from streamlit_gsheets import GSheetsConnection
from streamlit_sortables import sort_items
import pandas as pd
from datetime import datetime
from zoneinfo import ZoneInfo

# ---------------- Config ----------------
# Orden por defecto (Dani salió del equipo)
DEFAULT_MEMBERS = ["Fer", "Camilo", "Lini", "Majo", "Estefi"]
CLIENTS = ["Church's Chicken", "John Deere", "TNZ", "Mazda", "Lufthansa",
           "Swiss", "Australian", "Unilever", "Wendy's", "Unilever Commerce",
           "Support (other accounts)"]
PRIORITIES = ["Low", "Medium", "High"]
PRIO_ICON = {"Low": "🟢", "Medium": "🟠", "High": "🔴"}
PRIO_CLASS = {"Low": "pill-low", "Medium": "pill-medium", "High": "pill-high"}
PRIO_COLOR = {"Low": "#16a34a", "Medium": "#f59e0b", "High": "#dc2626"}
COLUMNS = ["member", "client", "priority", "time"]
MAX_SHOWN = 20

MONTHS = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"]
BOGOTA = ZoneInfo("America/Bogota")   # 👈 zona horaria de Colombia (UTC-5)

def ahora_bogota():
    return datetime.now(BOGOTA)

MONTHS = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"]
def fmt_time(d):
    return f"{d.day:02d} {MONTHS[d.month-1]} {d.hour:02d}:{d.minute:02d}"

def H(s):
    return "\n".join(line.strip() for line in s.strip().split("\n"))

# ---------------- Conexión ----------------
conn = st.connection("gsheets", type=GSheetsConnection)

def load_history():
    try:
        df = conn.read(worksheet="historial", ttl=3)
        return df.dropna(how="all")
    except Exception:
        return pd.DataFrame(columns=COLUMNS)

def load_estado():
    """Devuelve (turn_index, order). El orden se guarda en la hoja para todos."""
    try:
        df = conn.read(worksheet="estado", ttl=3)
        row = df.iloc[0]
        idx = int(row["turn_index"])
        order_str = str(row.get("order", "") or "")
        order = [x.strip() for x in order_str.split(",") if x.strip()]
        # Si el orden guardado no coincide con el equipo actual, usa el por defecto
        if set(order) != set(DEFAULT_MEMBERS):
            order = DEFAULT_MEMBERS[:]
        return idx, order
    except Exception:
        return 0, DEFAULT_MEMBERS[:]

def save_history(df):
    conn.update(worksheet="historial", data=df)

def save_estado(idx, order):
    conn.update(worksheet="estado", data=pd.DataFrame([{
        "turn_index": int(idx),
        "order": ",".join(order)
    }]))

def clear_cache():
    st.cache_data.clear()

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
  .kpi { background:#fff; border-radius:16px; padding:18px 20px; border:1px solid #eef0f3;
    box-shadow:0 4px 14px rgba(15,23,42,.06); text-align:center; }
  .kpi .kpi-num { font-size:30px; font-weight:800; line-height:1; }
  .kpi .kpi-lbl { font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.5px; margin-top:6px; }
  .section-title { font-size:20px; font-weight:800; color:#0f172a; margin:8px 0 4px; }
  .chart-cap { font-size:13px; color:#475569; margin-bottom:14px; }
  .barrow { display:flex; align-items:center; gap:12px; margin-bottom:13px; }
  .barlabel { min-width:72px; font-weight:600; font-size:14px; color:#334155; }
  .bartrack { flex:1; background:#f1f5f9; border-radius:8px; height:26px; overflow:hidden; }
  .barfill { height:100%; border-radius:8px; display:flex; overflow:hidden; min-width:2px; transition:width .3s; }
  .barval { min-width:26px; text-align:right; font-weight:800; color:#0f172a; font-size:14px; }
  .legend { display:flex; gap:18px; margin-bottom:14px; font-size:13px; color:#475569; font-weight:600; }
  div[data-testid="stExpander"] summary p,
  div[data-testid="stExpander"] summary span,
  details summary {
    color: #1e1b4b !important;
    font-weight: 700 !important;
    font-size: 15px !important;
  }
  /* El iconito de la flecha del expander */
  div[data-testid="stExpander"] summary svg {
    fill: #4f46e5 !important;
  }
  /* Caption/descripción dentro del expander */
  div[data-testid="stExpander"] .stCaption,
  div[data-testid="stExpander"] p {
    color: #475569 !important;
  }
</style>
""", unsafe_allow_html=True)

# ---------------- Cargar datos ----------------
hist_df = load_history()
turn_index, MEMBERS = load_estado()      # MEMBERS = orden actual (compartido)
next_person = MEMBERS[turn_index % len(MEMBERS)]
history = hist_df.to_dict("records") if not hist_df.empty else []

# ---------------- Encabezado + Actualizar ----------------
head_col1, head_col2 = st.columns([4, 1])
with head_col1:
    st.markdown("<h1 class='page-title'>🎟️ Turnos para tomar RQ's</h1>", unsafe_allow_html=True)
    st.markdown("<p style='color:#64748b;margin-top:-8px;'>Rotación del equipo · datos compartidos.</p>", unsafe_allow_html=True)
with head_col2:
    st.markdown("<div style='height:18px'></div>", unsafe_allow_html=True)
    if st.button("🔄 Actualizar", use_container_width=True,
                 help="Trae los últimos cambios que hicieron tus compañeros."):
        clear_cache()
        st.rerun()

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
            try:
                fresh = conn.read(worksheet="historial", ttl=0).dropna(how="all")
            except Exception:
                st.error("⚠️ No se pudo leer el historial. Intenta de nuevo en unos segundos.")
                st.stop()
            new_row = pd.DataFrame([{
                "member": next_person, "client": client,
                "priority": priority, "time": fmt_time(ahora_bogota())   # 👈 CAMBIO
            }])
            updated = pd.concat([new_row, fresh], ignore_index=True)
            with st.spinner("Guardando..."):
                save_history(updated)
                save_estado((turn_index + 1) % len(MEMBERS), MEMBERS)
                clear_cache()
            st.rerun()

# ---------------- Editar orden (botones ▲▼) ----------------
with st.expander("⚙️ Editar orden de rotación"):
    st.caption("Usa las flechas para mover a cada persona. Luego pulsa **Guardar orden**.")

    # Borrador editable en memoria
    if "draft_order" not in st.session_state:
        st.session_state.draft_order = MEMBERS[:]
    if set(st.session_state.draft_order) != set(MEMBERS):
        st.session_state.draft_order = MEMBERS[:]

    def mover(idx, direccion):
        lst = st.session_state.draft_order[:]
        if direccion == "up" and idx > 0:
            lst[idx], lst[idx-1] = lst[idx-1], lst[idx]
        elif direccion == "down" and idx < len(lst) - 1:
            lst[idx], lst[idx+1] = lst[idx+1], lst[idx]
        st.session_state.draft_order = lst

    draft = st.session_state.draft_order
    for i, m in enumerate(draft):
        c_num, c_name, c_up, c_down = st.columns([0.6, 5, 1, 1])
        c_num.markdown(f"<div style='padding-top:8px;font-weight:700;color:#64748b'>{i+1}</div>", unsafe_allow_html=True)
        c_name.markdown(f"<div style='padding-top:6px;font-weight:700;font-size:16px;color:#1e1b4b'>{m}</div>", unsafe_allow_html=True)
        c_up.button("⬆️", key=f"up_{i}", disabled=(i == 0),
                    on_click=mover, args=(i, "up"), use_container_width=True)
        c_down.button("⬇️", key=f"down_{i}", disabled=(i == len(draft)-1),
                      on_click=mover, args=(i, "down"), use_container_width=True)

    st.markdown("<div style='height:8px'></div>", unsafe_allow_html=True)
    gc1, gc2 = st.columns(2)
    if gc1.button("💾 Guardar orden", use_container_width=True):
        with st.spinner("Guardando orden..."):
            save_estado(turn_index % len(draft), draft)
            clear_cache()
        st.success("¡Orden actualizado para todo el equipo!")
        st.rerun()
    if gc2.button("↩️ Deshacer cambios", use_container_width=True):
        st.session_state.draft_order = MEMBERS[:]
        st.rerun()

# ---------------- Corregir / eliminar una RQ ----------------
with st.expander("✏️ Corregir o eliminar una RQ"):
    if not history:
        st.caption("Aún no hay RQ's para corregir.")
    else:
        st.caption("Elige una RQ del historial reciente y cámbiale el cliente o la prioridad.")

        # Opciones legibles del historial reciente
        opciones = [
            f"{i+1}. {h['time']} · {h['member']} · {h['client']} · {h['priority']}"
            for i, h in enumerate(history[:MAX_SHOWN])
        ]
        sel = st.selectbox("RQ a corregir", range(len(opciones)),
                           format_func=lambda i: opciones[i], key="edit_sel")
        actual = history[sel]

        ec1, ec2 = st.columns(2)
        nuevo_cliente = ec1.selectbox(
            "Cliente", CLIENTS,
            index=CLIENTS.index(actual["client"]) if actual["client"] in CLIENTS else 0,
            key="edit_client")
        nueva_prio = ec2.selectbox(
            "Prioridad", PRIORITIES,
            index=PRIORITIES.index(actual["priority"]) if actual["priority"] in PRIORITIES else 1,
            key="edit_prio")

        def _leer_fresh():
            try:
                return conn.read(worksheet="historial", ttl=0).dropna(how="all").reset_index(drop=True)
            except Exception:
                st.error("⚠️ No se pudo leer el historial. Intenta de nuevo.")
                st.stop()

        def _buscar_fila(df, ref):
            # Encuentra la fila que coincide con la RQ seleccionada
            m = ((df["member"] == ref["member"]) & (df["client"] == ref["client"]) &
                 (df["priority"] == ref["priority"]) & (df["time"] == ref["time"]))
            idxs = df.index[m].tolist()
            return idxs[0] if idxs else None

        b1, b2 = st.columns(2)
        if b1.button("💾 Guardar corrección", use_container_width=True):
            fresh = _leer_fresh()
            fila = _buscar_fila(fresh, actual)
            if fila is None:
                st.warning("No encontré esa RQ (quizá alguien la cambió). Pulsa 🔄 Actualizar.")
            else:
                fresh.at[fila, "client"] = nuevo_cliente
                fresh.at[fila, "priority"] = nueva_prio
                with st.spinner("Guardando corrección..."):
                    save_history(fresh)
                    clear_cache()
                st.success("¡RQ corregida! ✅")
                st.rerun()

        if b2.button("🗑️ Eliminar esta RQ", use_container_width=True):
            fresh = _leer_fresh()
            fila = _buscar_fila(fresh, actual)
            if fila is None:
                st.warning("No encontré esa RQ (quizá ya se eliminó). Pulsa 🔄 Actualizar.")
            else:
                fresh = fresh.drop(index=fila).reset_index(drop=True)
                with st.spinner("Eliminando..."):
                    save_history(fresh)
                    clear_cache()
                st.success("RQ eliminada 🗑️")
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
        with st.spinner("Guardando..."):
            save_estado((turn_index + 1) % len(MEMBERS), MEMBERS)
            clear_cache()
        st.rerun()
    if bc2.button("🗑️ Reiniciar", use_container_width=True):
        st.session_state.confirmar_reset = True

    if st.session_state.get("confirmar_reset", False):
        st.warning("⚠️ Esto borrará TODO el historial para todos. ¿Seguro?")
        cc1, cc2 = st.columns(2)
        if cc1.button("Sí, borrar", use_container_width=True):
            with st.spinner("Reiniciando..."):
                save_history(pd.DataFrame(columns=COLUMNS))
                save_estado(0, MEMBERS)
                clear_cache()
            st.session_state.confirmar_reset = False
            st.rerun()
        if cc2.button("Cancelar", use_container_width=True):
            st.session_state.confirmar_reset = False
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

    total = len(history)
    titulo = "Historial" if total <= MAX_SHOWN else f"Historial (mostrando {MAX_SHOWN} de {total})"
    block += f'<div class="label" style="margin-top:20px;">{titulo}</div>'
    if history:
        for h in history[:MAX_SHOWN]:
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

# ================================================================
# ==================  📊  INDICADORES  ===========================
# ================================================================
st.markdown("<hr style='margin:26px 0;border:none;border-top:1px solid #e2e8f0;'>", unsafe_allow_html=True)
st.markdown("<div class='section-title'>📊 Indicadores</div>", unsafe_allow_html=True)

if not history:
    st.info("Registra RQ's para ver los indicadores.")
else:
    prio_totals = {p: sum(1 for h in history if h["priority"] == p) for p in PRIORITIES}
    k0, k1, k2, k3 = st.columns(4)
    k0.markdown(H(f"<div class='kpi'><div class='kpi-num' style='color:#4f46e5'>{total}</div><div class='kpi-lbl'>Total RQ's</div></div>"), unsafe_allow_html=True)
    k1.markdown(H(f"<div class='kpi'><div class='kpi-num' style='color:{PRIO_COLOR['Low']}'>🟢 {prio_totals['Low']}</div><div class='kpi-lbl'>Low</div></div>"), unsafe_allow_html=True)
    k2.markdown(H(f"<div class='kpi'><div class='kpi-num' style='color:{PRIO_COLOR['Medium']}'>🟠 {prio_totals['Medium']}</div><div class='kpi-lbl'>Medium</div></div>"), unsafe_allow_html=True)
    k3.markdown(H(f"<div class='kpi'><div class='kpi-num' style='color:{PRIO_COLOR['High']}'>🔴 {prio_totals['High']}</div><div class='kpi-lbl'>High</div></div>"), unsafe_allow_html=True)

    st.markdown("<div style='height:10px'></div>", unsafe_allow_html=True)

    per_prio = {m: {p: 0 for p in PRIORITIES} for m in MEMBERS}
    for h in history:
        if h["member"] in per_prio and h["priority"] in PRIORITIES:
            per_prio[h["member"]][h["priority"]] += 1

    t1, t2, t3 = st.tabs(["👥 Por persona", "🎯 Por prioridad", "🏢 Por cliente"])

    with t1:
        max_c = max(list(counts.values()) + [1])
        html = "<div class='card'><div class='chart-cap'>Cantidad de RQ's tomadas por cada miembro</div>"
        for m in MEMBERS:
            c = counts[m]; pct = int(c / max_c * 100)
            html += (f"<div class='barrow'><span class='barlabel'>{m}</span>"
                     f"<div class='bartrack'><div class='barfill' style='width:{pct}%;background:#4f46e5'></div></div>"
                     f"<span class='barval'>{c}</span></div>")
        html += "</div>"
        st.markdown(H(html), unsafe_allow_html=True)

    with t2:
        max_t = max([counts[m] for m in MEMBERS] + [1])
        html = ("<div class='card'><div class='chart-cap'>Mezcla de niveles por miembro (ancho = volumen total)</div>"
                "<div class='legend'><span>🟢 Low</span><span>🟠 Medium</span><span>🔴 High</span></div>")
        for m in MEMBERS:
            tm = counts[m]; pct = int(tm / max_t * 100); segs = ""
            for p in PRIORITIES:
                cnt = per_prio[m][p]
                if cnt > 0 and tm > 0:
                    segs += f"<div style='width:{cnt / tm * 100}%;background:{PRIO_COLOR[p]};height:100%'></div>"
            html += (f"<div class='barrow'><span class='barlabel'>{m}</span>"
                     f"<div class='bartrack'><div class='barfill' style='width:{pct}%'>{segs}</div></div>"
                     f"<span class='barval'>{tm}</span></div>")
        html += "</div>"
        st.markdown(H(html), unsafe_allow_html=True)

    with t3:
        client_counts = {}
        for h in history:
            client_counts[h["client"]] = client_counts.get(h["client"], 0) + 1
        ordered = sorted(client_counts.items(), key=lambda x: x[1], reverse=True)
        max_cl = max([v for _, v in ordered] + [1])
        html = "<div class='card'><div class='chart-cap'>RQ's tomadas por cliente</div>"
        for name, c in ordered:
            pct = int(c / max_cl * 100)
            html += (f"<div class='barrow'><span class='barlabel' style='min-width:150px'>{name}</span>"
                     f"<div class='bartrack'><div class='barfill' style='width:{pct}%;background:#7c3aed'></div></div>"
                     f"<span class='barval'>{c}</span></div>")
        html += "</div>"
        st.markdown(H(html), unsafe_allow_html=True)