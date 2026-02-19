"use client";

import {
  Background,
  type Edge,
  type Node,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const nodeDefaults = {
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
  style: {
    background: "var(--bg)",
    border: "1px solid var(--fg)",
    borderRadius: 0,
    padding: "12px 16px",
    fontSize: "12px",
    fontFamily: "inherit",
    color: "var(--fg)",
    stroke: "var(--color-primary)",
    strokeWidth: 1,
  },
};

const initialNodes: Node[] = [
  {
    id: "product",
    position: { x: 0, y: 0 },
    data: { label: "Product" },
    sourcePosition: Position.Right,
    targetPosition: Position.Bottom,
    style: nodeDefaults.style,
  },
  {
    id: "customer",
    position: { x: 350, y: 0 },
    data: { label: "Customer" },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Left,
    style: nodeDefaults.style,
  },
  {
    id: "twig",
    position: { x: 175, y: 180 },
    data: { label: "Twig" },
    sourcePosition: Position.Top,
    targetPosition: Position.Top,
    style: nodeDefaults.style,
  },
];

const edgeDefaults = {
  animated: true,
  style: { stroke: "var(--color-primary)", strokeWidth: 1 },
  labelStyle: {
    fontSize: 10,
    fontFamily: "inherit",
    fill: "var(--color-primary)",
  },
  labelBgStyle: {
    fill: "var(--bg)",
  },
};

const initialEdges: Edge[] = [
  {
    id: "product-customer",
    source: "product",
    target: "customer",
    label: "releases features",
    type: "straight",
    ...edgeDefaults,
    style: { stroke: "#585AA9", strokeWidth: 1 },
    labelStyle: { ...edgeDefaults.labelStyle, fill: "#585AA9" },
  },
  {
    id: "customer-twig",
    source: "customer",
    target: "twig",
    label: "generates signals",
    type: "straight",
    ...edgeDefaults,
    style: { stroke: "#766F2D", strokeWidth: 1 },
    labelStyle: { ...edgeDefaults.labelStyle, fill: "#766F2D" },
  },
  {
    id: "twig-product",
    source: "twig",
    target: "product",
    label: "creates PRs",
    type: "straight",
    ...edgeDefaults,
  },
];

export function FlowDiagram() {
  const [nodes] = useNodesState(initialNodes);
  const [edges] = useEdgesState(initialEdges);

  return (
    <div className="h-full w-full" style={{ minHeight: 400 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        style={{ background: "transparent" }}
      >
        <Background color="var(--color-primary)" gap={20} size={1} />
      </ReactFlow>
    </div>
  );
}
