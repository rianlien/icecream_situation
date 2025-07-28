// js/networkGraph.js

import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

// D3.jsでネットワークグラフを描画する関数
export function drawNetworkGraph(nodes, links) {
    const container = document.getElementById('network-graph-container');
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const svg = d3.select("#d3-graph")
        .attr("viewBox", [0, 0, width, height]);

    // Clear existing graph elements
    svg.selectAll("*").remove();

    // ズーム機能の追加
    const g = svg.append("g"); // ノードとリンクをグループ化

    const zoom = d3.zoom()
        .scaleExtent([0.1, 10]) // ズームの範囲 (最小0.1倍、最大10倍)
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
        });

    svg.call(zoom);

    // 矢印マーカーの定義 (各tokenIdに対応する色で一度だけ定義)
    const markerColors = {
        0: '#fdba74', // token-0
        1: '#fdba74', // token-1
        2: '#6ee7b7', // token-2
        3: '#6ee7b7', // token-3
        'default': '#999' // デフォルト
    };

    for (const key in markerColors) {
        svg.append("defs").append("marker")
            .attr("id", `arrowhead-${key}`)
            .attr("viewBox", "-0 -5 10 10")
            .attr("refX", 15) // ノードの半径より少し外側に配置 (固定値)
            .attr("refY", 0)
            .attr("orient", "auto")
            .attr("markerWidth", 5)
            .attr("markerHeight", 5)
            .attr("xoverflow", "visible")
            .append("svg:path")
            .attr("d", 'M 0,-5 L 10,0 L 0,5')
            .attr("fill", markerColors[key])
            .style("stroke", "none");
    }

    const link = g.append("g")
        .attr("stroke-opacity", 0.6)
        .selectAll("line") // Change to line
        .data(links)
        .join("line") // Change to line
        .attr("stroke-width", 1.5)
        .attr("stroke", d => {
            if (d.tokenId === 0 || d.tokenId === 1) return markerColors[0];
            if (d.tokenId === 2 || d.tokenId === 3) return markerColors[2];
            return markerColors['default'];
        })
        .attr("marker-end", d => {
            if (d.tokenId === 0 || d.tokenId === 1) return `url(#arrowhead-0)`;
            if (d.tokenId === 2 || d.tokenId === 3) return `url(#arrowhead-2)`;
            return `url(#arrowhead-default)`;
        })
        .on("mouseover", (event, d) => {
            const tooltip = d3.select("#tooltip");
            tooltip.style("opacity", 1)
                   .style("left", (event.pageX + 10) + "px")
                   .style("top", (event.pageY - 28) + "px")
                   .html(`From: ${d.source.id}<br>To: ${d.target.id}<br>Token ID: ${d.tokenId}`);
            tooltip.classed("hidden", false);
        })
        .on("mouseout", () => {
            d3.select("#tooltip").classed("hidden", true);
        });

    const node = g.append("g")
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.5)
        .selectAll("circle")
        .data(nodes)
        .join("circle")
        .attr("r", d => 2 + Math.sqrt(d.connectionCount || 0) * 2)
        .attr("fill", d => {
            if (d.type === 'vanilla-member') return '#fbbf24';
            if (d.type === 'chocomint-member') return '#34d399';
            if (d.type === 'mint-address') return '#9ca3af';
            if (d.type === 'normal-wallet') return '#3b82f6';
            return '#ccc';
        })
        .on("mouseover", (event, d) => {
            const tooltip = d3.select("#tooltip");
            tooltip.style("opacity", 1)
                   .style("left", (event.pageX + 10) + "px")
                   .style("top", (event.pageY - 28) + "px")
                   .html(d.id);
            tooltip.classed("hidden", false);
        })
        .on("mouseout", () => {
            d3.select("#tooltip").classed("hidden", true);
        });

    const simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(80))
        .force("charge", d3.forceManyBody().strength(-300))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .on("tick", () => {
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            node
                .attr("cx", d => d.x)
                .attr("cy", d => d.y);
        });

    node.call(d3.drag()
        .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        })
        .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = d.y;
        })
        .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }));
}