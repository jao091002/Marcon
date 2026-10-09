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
  const { requests, accountId } = useDemoStore();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Todas");
  const [priority, setPriority] = useState("");
  const [block, setBlock] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
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
            <section className={styles.requesterGroup} key={group.key}>
              <div className={styles.requesterGroupHeading}>
                <div>
                  <h2>{group.person}</h2>
                  <p>
                    {group.requests.length}{" "}
                    {group.requests.length === 1 ? "requisição" : "requisições"}
                    {group.requests.some((request) => request.batchId) &&
                      " · itens dos carrinhos enviados"}
                  </p>
                </div>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setSelectedGroupKey(group.key)}
                >
                  {role === "lider"
                    ? "Analisar pedidos desta pessoa"
                    : role === "almoxarifado"
                      ? "Selecionar pedidos para entrega"
                      : "Ver pedidos desta pessoa"}
                </button>
              </div>
              <div className={styles.requesterItems}>
                {group.requests.map((r) => (
                  <article
                    key={r.id}
                    data-request-id={r.id}
                    data-priority={r.priority}
                    className={styles.requesterItem}
                  >
                    <div className={styles.cardTop}>
                      <strong>#{r.id}</strong>
                      {badge(r.status)}
                      <strong
                        className={`${styles.priority} ${styles[`priority${r.priority}`]}`}
                      >
                        {r.priority}
                      </strong>
                    </div>
                    <strong className={styles.requesterItemMaterial}>
                      {r.material}
                    </strong>
                    <p>
                      {r.code} · {r.quantity} peças
                      {r.requestedUnit === "box" &&
                        ` (${r.requestedAmount} caixas de ${r.packSizeAtRequest})`}
                    </p>
                    <p>
                      {r.block} ·{" "}
                      {r.sector || "Setor não informado"}
                    </p>
                    {r.anomaly?.unusual && (
                      <div className={styles.anomaly}>
                        <strong>Pedido fora do padrão</strong>
                        {r.anomaly.reasons.map((reason) => (
                          <p key={reason}>{reason}</p>
                        ))}
                        <p>
                          <strong>Justificativa:</strong>{" "}
                          {r.justification || "Não registrada no pedido legado"}
                        </p>
                      </div>
                    )}
                    {!r.anomaly?.unusual && r.justification && (
                      <p>
                        <strong>Justificativa:</strong> {r.justification}
                      </p>
                    )}
                    {r.status === "Rejeitada" && (
                      <p>
                        <strong>Motivo da rejeição:</strong>{" "}
                        {r.cancellationReason}
                      </p>
                    )}
                    {r.allocations?.map((a) => (
                      <p key={a.warehouse}>
                        {r.pickedAt
                          ? "Retirada registrada"
                          : "Retirada recomendada"}
                        : {a.warehouse} · {a.location} · {a.quantity} peças
                      </p>
                    ))}
                    {r.fulfilledBy && (
                      <p>
                        {r.fulfilledBy === accountId
                          ? "Atendimento assumido por você"
                          : `Responsável: matrícula ${r.fulfilledBy}`}
                      </p>
                    )}
                    {r.deliveredAt && (
                      <p>
                        Entregue em{" "}
                        {new Date(r.deliveredAt).toLocaleString("pt-BR")}
                      </p>
                    )}
                  </article>
                ))}
              </div>
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
        title={selectedGroup ? `Pedidos de ${selectedGroup.person}` : "Pedidos"}
        onClose={() => setSelectedGroupKey(null)}
      >
        {selectedGroup && (
          <>
            <p>
              {selectedGroup.requests.length}{" "}
              {selectedGroup.requests.length === 1
                ? "requisição agrupada"
                : "requisições agrupadas"}{" "}
              por solicitante. Cada item mantém seu status, quantidade,
              conferência e registro próprios.
            </p>
            <div className={styles.groupOperations}>
              {selectedGroup.requests.map((request) => (
                <article className={styles.groupOperationItem} key={request.id}>
                  <h3>
                    #{request.id} · {request.material}
                  </h3>
                  <p>
                    {request.quantity} peças · {request.block} ·{" "}
                    {request.status} · {request.priority}
                  </p>
                  {history ? (
                    <div className="ops-actions">
                      <p>
                        Entregue em{" "}
                        {request.deliveredAt
                          ? new Date(request.deliveredAt).toLocaleString(
                              "pt-BR",
                            )
                          : "Data não registrada"}
                      </p>
                      <p>
                        Justificativa:{" "}
                        {request.justification || "Não informada"}
                      </p>
                      {request.allocations?.map((allocation) => (
                        <p key={allocation.warehouse}>
                          {allocation.quantity} peças retiradas de{" "}
                          {allocation.warehouse} · {allocation.location}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <RequestOperations
                      key={request.id}
                      id={request.id}
                      role={role}
                      request={request}
                    />
                  )}
                </article>
              ))}
            </div>
          </>
        )}
      </DashboardDialog>
    </>
  );
}
