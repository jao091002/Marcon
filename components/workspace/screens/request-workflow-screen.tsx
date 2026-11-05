"use client";
import { useMemo, useState } from "react";
import type { Role } from "@/lib/workspace-routes";
import { useDemoStore } from "../demo-store";
import { heading, badge } from "../ui";
import { RequestOperations } from "../operations/request-operations";
import { DashboardDialog } from "../operations/dashboard-dialog";
import styles from "./workflow.module.css";

export function RequestWorkflowScreen({
  role,
  history = false,
  compact = false,
}: {
  role: Role;
  history?: boolean;
  compact?: boolean;
}) {
  const { requests, accountId, runAction } = useDemoStore();
  const [query, setQuery] = useState("");
  const [requesterQuery, setRequesterQuery] = useState("");
  const [status, setStatus] = useState("Todas");
  const [priority, setPriority] = useState("");
  const [block, setBlock] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const toggleGroup = (key: string) =>
    setOpenGroups((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const scopedRequests = requests.filter(
    (r) => role !== "funcionario" || (Boolean(accountId) && r.requesterId === accountId),
  );
  const rows = scopedRequests.filter((r) =>
    history
      ? r.status === "Entregue"
      : role === "almoxarifado"
        ? [
            "Aprovada",
            "Em separação",
            "Em entrega",
            "Cancelamento solicitado",
          ].includes(r.status)
        : r.status !== "Entregue",
  );
  const shown = rows
    .filter(
      (r) =>
        (status === "Todas" || r.status === status) &&
        (!priority || r.priority === priority) &&
        (!block || r.block === block) &&
        (!warehouse ||
          r.allocations?.some(
            (allocation) => allocation.warehouse === warehouse,
          )) &&
        r.person
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLocaleLowerCase("pt-BR")
          .includes(
            requesterQuery
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .trim()
              .toLocaleLowerCase("pt-BR"),
          ) &&
        `${r.id} ${r.material} ${r.code} ${r.person} ${r.block}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      history
        ? new Date(b.deliveredAt ?? b.createdAt ?? 0).getTime() -
            new Date(a.deliveredAt ?? a.createdAt ?? 0).getTime() || b.id - a.id
        : { Urgente: 0, Moderado: 1, Leve: 2 }[a.priority] -
            { Urgente: 0, Moderado: 1, Leve: 2 }[b.priority] || b.id - a.id,
    );
  const groups = useMemo(() => {
    const grouped = new Map<
      string,
      { key: string; person: string; requests: typeof shown }
    >();
    for (const request of shown) {
      const identity = `person:${request.person
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLocaleLowerCase("pt-BR")}`;
      const group = grouped.get(identity) ?? {
        key: identity,
        person: request.person,
        requests: [],
      };
      group.requests.push(request);
      grouped.set(identity, group);
    }
    return [...grouped.values()];
  }, [shown]);
  const selectedGroup = groups.find((group) => group.key === selectedGroupKey);
  const selectedRequest = scopedRequests.find(
    (request) => request.id === selectedRequestId,
  );
  async function claimAll(group: (typeof groups)[number]) {
    const claimable = group.requests.filter((request) => request.status === "Aprovada");
    setBulkBusy(true);
    setBulkMessage("");
    let done = 0;
    try {
      for (const request of claimable) {
        await runAction({ type: "claimRequest", id: request.id });
        done += 1;
      }
      setBulkMessage(`${done} requisição(ões) assumida(s) para separação.`);
    } catch (error) {
      setBulkMessage(
        `${done} de ${claimable.length} assumida(s). Falha na #${claimable[done].id}: ${
          error instanceof Error ? error.message : "falha na operação."
        }`,
      );
    } finally {
      setBulkBusy(false);
    }
  }
  const title = history
    ? role === "funcionario"
      ? "Meu histórico"
      : "Histórico geral de entregas"
    : role === "lider"
      ? "Solicitações do bloco"
      : role === "funcionario"
        ? "Meus pedidos"
        : "Requisições para atendimento";
  return (
    <>
      {compact ? (
        <h2 id="meus-pedidos">{title}</h2>
      ) : (
        heading(
          history ? "ENTREGAS CONCLUÍDAS" : "OPERAÇÃO",
          title,
          history
            ? role === "funcionario"
              ? "Consulte as entregas concluídas dos seus pedidos."
              : "Entregas concluídas de todos os blocos e locais. Use os filtros para consultar o atendimento."
            : role === "lider"
              ? "Analise o pedido, o padrão de consumo e a justificativa antes de aprovar ou rejeitar."
              : role === "funcionario"
                ? "Acompanhe seus pedidos, consulte os detalhes e confirme o recebimento das peças."
                : "Assuma o atendimento, confira a retirada e confirme a entrega no destino.",
        )
      )}
      {!history && !compact && (
        <div className={styles.summary} aria-label="Prioridades de atendimento">
          {["Urgente", "Moderado", "Leve"].map((value) => (
            <button
              key={value}
              className={styles[`priority${value}`]}
              aria-pressed={priority === value}
              onClick={() => setPriority(priority === value ? "" : value)}
            >
              <strong>{value}</strong>
              <span>
                {rows.filter((row) => row.priority === value).length} pedidos
              </span>
            </button>
          ))}
        </div>
      )}
      {!history && role === "lider" && (
        <div className={styles.summary}>
          {[
            "Pendente",
            "Em análise",
            "Aprovada",
            "Em separação",
            "Em entrega",
            "Rejeitada",
          ].map((s) => (
            <button
              key={s}
              aria-pressed={status === s}
              onClick={() => setStatus(status === s ? "Todas" : s)}
            >
              <span>{s}</span>
              <strong>{rows.filter((r) => r.status === s).length}</strong>
            </button>
          ))}
        </div>
      )}
      <section className="panel">
        <div className={styles.filters}>
          <label>
            Pesquisar solicitante
            <input
              type="search"
              value={requesterQuery}
              onChange={(e) => setRequesterQuery(e.target.value)}
              placeholder="Nome ou parte do nome"
            />
          </label>
          <label>
            Buscar pedido
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Material, matrícula, solicitante ou número"
            />
          </label>
          <label>
            Situação
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option>Todas</option>
              {[...new Set(rows.map((r) => r.status))].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <span>{shown.length} pedidos</span>
          {history && role !== "funcionario" && (
            <>
              <label>
                Bloco
                <select
                  value={block}
                  onChange={(event) => setBlock(event.target.value)}
                >
                  <option value="">Todos os blocos</option>
                  {[...new Set(rows.map((row) => row.block))]
                    .sort()
                    .map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                </select>
              </label>
              <label>
                Local de retirada
                <select
                  value={warehouse}
                  onChange={(event) => setWarehouse(event.target.value)}
                >
                  <option value="">Todos os locais</option>
                  {[
                    ...new Set(
                      rows.flatMap(
                        (row) =>
                          row.allocations?.map(
                            (allocation) => allocation.warehouse,
                          ) ?? [],
                      ),
                    ),
                  ]
                    .sort()
                    .map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                </select>
              </label>
            </>
          )}
        </div>
        <div className={styles.requesterGroups}>
          {groups.map((group) => (
            <section
              className={styles.requesterGroup}
              key={group.key}
              data-open={openGroups.has(group.key)}
            >
              <div className={styles.requesterGroupHeading}>
                <button
                  type="button"
                  className={styles.requesterToggle}
                  aria-expanded={openGroups.has(group.key)}
                  aria-controls={`grupo-${group.key}`}
                  onClick={() => toggleGroup(group.key)}
                >
                  <span className={styles.requesterAvatar} aria-hidden="true">
                    {group.person
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join("")
                      .toLocaleUpperCase("pt-BR")}
                  </span>
                  <span className={styles.requesterIdentity}>
                    <h2>{group.person}</h2>
                    <p>
                      {group.requests.length}{" "}
                      {group.requests.length === 1 ? "requisição" : "requisições"}
                      {group.requests.some((request) => request.priority === "Urgente") &&
                        ` · ${group.requests.filter((request) => request.priority === "Urgente").length} urgente(s)`}
                    </p>
                  </span>
                  <span className={styles.requesterChevron} aria-hidden="true">▾</span>
                </button>
                <button
                  className={styles.requesterAction}
                  type="button"
                  onClick={() => {
                    setBatchMode(false);
                    setSelectedGroupKey(group.key);
                  }}
                >
                  {role === "lider"
                    ? "Ver para aprovação (" + group.requests.length + ")"
                    : role === "almoxarifado"
                      ? "Ver para entrega (" + group.requests.length + ")"
                      : "Ver todos (" + group.requests.length + ")"}
                </button>
              </div>
              {openGroups.has(group.key) && (
                <div className={styles.requesterItems} id={`grupo-${group.key}`}>
                  {group.requests.map((r) => (
                    <button
                      type="button"
                      key={r.id}
                      data-request-id={r.id}
                      className={styles.requesterPreviewItem}
                      data-priority={r.priority}
                      onClick={() => {
                        setSelectedGroupKey(null);
                        setSelectedRequestId(r.id);
                      }}
                    >
                      <span className={styles.itemMain}>
                        <strong className={styles.requesterItemMaterial}>{r.material}</strong>
                        <span className={styles.itemMeta}>
                          #{r.id} · {r.code} · {r.quantity} peças
                          {r.requestedUnit === "box" && ` (${r.requestedAmount} cx de ${r.packSizeAtRequest})`}
                          {" · "}{r.block}
                        </span>
                      </span>
                      <span className={styles.itemSide}>
                        <span className={`${styles.priorityDot} ${styles[`priority${r.priority}`]}`}>
                          {r.priority}
                        </span>
                        {badge(r.status)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
        {!shown.length && (
          <p className={styles.empty}>
            {history
              ? role === "funcionario"
                ? "Você ainda não tem entregas concluídas."
                : "Nenhuma entrega concluída neste perfil."
              : "Nenhum pedido nesta situação."}
          </p>
        )}
      </section>
      <DashboardDialog
        open={Boolean(selectedGroup)}
        title={
          selectedGroup
            ? batchMode
              ? `Entrega em lote · ${selectedGroup.person}`
              : `Pedidos de ${selectedGroup.person}`
            : "Pedidos"
        }
        onClose={() => {
          setSelectedGroupKey(null);
          setBatchMode(false);
          setBulkMessage("");
        }}
      >
        {selectedGroup && batchMode ? (
          <>
            <div className={styles.bulkBar}>
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  setBatchMode(false);
                  setBulkMessage("");
                }}
              >
                ← Voltar à lista
              </button>
              {selectedGroup.requests.some((request) => request.status === "Aprovada") && (
                <button
                  className="button primary"
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => void claimAll(selectedGroup)}
                >
                  {bulkBusy
                    ? "Assumindo…"
                    : `Pegar todas para entrega (${selectedGroup.requests.filter((request) => request.status === "Aprovada").length})`}
                </button>
              )}
              {bulkMessage && <p role="status">{bulkMessage}</p>}
              <p>
                Confira o código, informe a quantidade e confirme a retirada de
                cada item; depois confirme a entrega. Os itens entregues saem
                desta lista automaticamente.
              </p>
            </div>
            <div className={styles.groupOperations}>
              {selectedGroup.requests.map((request) => (
                <article
                  className={styles.groupOperationItem}
                  key={request.id}
                  data-priority={request.priority}
                >
                  <h3>#{request.id} · {request.material}</h3>
                  <p>
                    {request.code} · {request.quantity} peças · {request.block} · {request.priority}
                  </p>
                  <RequestOperations
                    key={request.id}
                    id={request.id}
                    role={role}
                    request={request}
                  />
                </article>
              ))}
            </div>
          </>
        ) : (
          selectedGroup && (
            <>
              <p>
                {selectedGroup.requests.length} pedidos agrupados. Toque em uma
                requisição para abrir os detalhes completos.
              </p>
              {role === "almoxarifado" && !history && (
                <div className={styles.bulkBar}>
                  <button
                    className="button primary"
                    type="button"
                    onClick={() => setBatchMode(true)}
                  >
                    Entregar todas as requisições
                  </button>
                </div>
              )}
              <div className={styles.groupOperations}>
                {selectedGroup.requests.map((request) => (
                  <article className={styles.groupOperationItem} key={request.id}>
                    <h3>#{request.id} · {request.material}</h3>
                    <p>
                      {request.code} · {request.quantity} peças · {request.block} · {request.status} · {request.priority}
                    </p>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => {
                        setSelectedGroupKey(null);
                        setSelectedRequestId(request.id);
                      }}
                    >
                      Abrir requisição
                    </button>
                  </article>
                ))}
              </div>
            </>
          )
        )}
      </DashboardDialog>
      <DashboardDialog
        compact
        open={Boolean(selectedRequest)}
        title={selectedRequest ? `Requisição #${selectedRequest.id}` : "Requisição"}
        onClose={() => setSelectedRequestId(null)}
      >
        {selectedRequest && (
          <>
            <h3>{selectedRequest.material}</h3>
            <p>
              {selectedRequest.code} · {selectedRequest.quantity} peças · {selectedRequest.block} · {selectedRequest.person}
            </p>
            {history ? (
              <div className="ops-actions">
                <p>Prioridade: <strong>{selectedRequest.priority}</strong></p>
                <p>
                  Entregue em {selectedRequest.deliveredAt
                    ? new Date(selectedRequest.deliveredAt).toLocaleString("pt-BR")
                    : "Data não registrada"}
                </p>
                <p>Justificativa: {selectedRequest.justification || "Não informada"}</p>
                {selectedRequest.allocations?.map((allocation) => (
                  <p key={allocation.warehouse}>
                    {allocation.quantity} peças retiradas de {allocation.warehouse} · {allocation.location}
                  </p>
                ))}
              </div>
            ) : (
              <RequestOperations
                key={selectedRequest.id}
                id={selectedRequest.id}
                role={role}
                request={selectedRequest}
              />
            )}
          </>
        )}
      </DashboardDialog>
    </>
  );
}
