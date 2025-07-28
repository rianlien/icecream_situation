// js/networkGraph.js

import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

// D3.jsでネットワークグラフを描画する関数
export function drawNetworkGraph(nodes, links) {
    console.log("Nodes received by drawNetworkGraph:", nodes);
    console.log("Links received by drawNetworkGraph:", links);
    const container = document.getElementById('network-graph-container');
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Initialize node positions if not already set
    nodes.forEach(node => {
        if (node.x === undefined || isNaN(node.x)) node.x = width / 2;
        if (node.y === undefined || isNaN(node.y)) node.y = height / 2;
    });

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
            .attr("refX", 10) // Correctly set refX to the tip of the arrow.
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

    

    // Link preprocessing to handle multiple links between the same two nodes
    const linkMap = new Map();
    links.forEach(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        // Create a canonical key to handle bidirectional links, ensuring A->B and B->A are grouped.
        const key = sourceId < targetId ? `${sourceId}-${targetId}` : `${targetId}-${sourceId}`;
        if (!linkMap.has(key)) {
            linkMap.set(key, []);
        }
        linkMap.get(key).push(link);
    });

    links.forEach(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        // Use the same canonical key to look up related links.
        const key = sourceId < targetId ? `${sourceId}-${targetId}` : `${targetId}-${sourceId}`;
        const relatedLinks = linkMap.get(key);

        if (sourceId === "0x00000000" && relatedLinks && relatedLinks.length > 1) {
            link.isAggregatedFromSpecialSource = true;
            link.aggregatedCount = relatedLinks.length; // Store count for stroke width
            link.multiple = false; // Force straight line
            link.curveIndex = 0; // No curve offset
        } else if (relatedLinks && relatedLinks.length > 1) {
            link.multiple = true;
            // Assign a curveIndex for each link to offset them
            // This centers the curves around the straight line
            const index = relatedLinks.indexOf(link);
            link.curveIndex = index - (relatedLinks.length - 1) / 2;
        } else {
            link.multiple = false;
            link.curveIndex = 0; // No curve for single links
        }
    });

    const link = g.append("g")
        .attr("stroke-opacity", 0.6)
        .selectAll("path") // Change to path
        .data(links)
        .join("path") // Change to path
        .attr("stroke-width", d => {
            if (d.isAggregatedFromSpecialSource) {
                return 1.5 + Math.log(d.aggregatedCount + 1) * 2; // Adjust formula for desired thickness
            }
            return 1.5;
        })
        .attr("fill", "none") // Ensure path is not filled
        .attr("stroke", d => {
            if (d.tokenId === 0 || d.tokenId === 1) return markerColors[0];
            if (d.tokenId === 2 || d.tokenId === 3) return markerColors[2];
            return markerColors['default'];
        })
        // Corrected marker-end attribute. The invalid refX() syntax is removed.
        .attr("marker-end", d => `url(#arrowhead-${d.tokenId === 0 || d.tokenId === 1 ? 0 : (d.tokenId === 2 || d.tokenId === 3 ? 2 : 'default')})`)
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
            link.attr("d", linkArc);

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
            d.fy = event.y;
        })
        .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }));

    // Updated function to generate path data for links, now correctly handling curves and node radius.
    function linkArc(d) {
        // Use canonical ordering for source and target to ensure curve direction is consistent.
        const isReversed = d.source.id > d.target.id;
        const canonicalSource = isReversed ? d.target : d.source;
        const canonicalTarget = isReversed ? d.source : d.target;

        // Calculate the vector for the canonical link direction.
        const dx = canonicalTarget.x - canonicalSource.x;
        const dy = canonicalTarget.y - canonicalSource.y;
        const dr = Math.sqrt(dx * dx + dy * dy);

        // Calculate the final end point of the link, shortened to the target node's edge.
        const targetNodeRadius = 2 + Math.sqrt(d.target.connectionCount || 0) * 2;
        let finalTargetX = d.target.x;
        let finalTargetY = d.target.y;

        const original_dx = d.target.x - d.source.x;
        const original_dy = d.target.y - d.source.y;
        const original_dr = Math.sqrt(original_dx * original_dx + original_dy * original_dy);

        if (original_dr > 0) {
            const ratio = (original_dr - targetNodeRadius) / original_dr;
            finalTargetX = d.source.x + original_dx * ratio;
            finalTargetY = d.source.y + original_dy * ratio;
        }

        if (d.multiple && dr > 0) {
            // Calculate the control point using the canonical direction.
            const midX = (canonicalSource.x + canonicalTarget.x) / 2;
            const midY = (canonicalSource.y + canonicalTarget.y) / 2;

            const normalX = -dy / dr;
            const normalY = dx / dr;

            // The curveIndex is already signed (-0.5, 0.5), which now correctly determines
            // the curve direction because the normal vector is consistent.
            const scale = 20 * d.curveIndex;
            const controlX = midX + normalX * scale;
            const controlY = midY + normalY * scale;

            // Draw the path from the original source to the adjusted final target.
            return `M${d.source.x},${d.source.y} Q${controlX},${controlY} ${finalTargetX},${finalTargetY}`;
        } else {
            // For single links, draw a straight line to the adjusted final target.
            return `M${d.source.x},${d.source.y}L${finalTargetX},${finalTargetY}`;
        }
    }
}

