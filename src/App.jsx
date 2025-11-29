import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, Trash2, Save, Image as ImageIcon, 
  Wand2, FlaskConical, GraduationCap, Skull, Scroll, 
  Ghost, Feather, Star, Gem, Crown, Eye, Flame, 
  ZoomIn, ZoomOut, RotateCcw, Calendar, Tag, Plus, LayoutList, User,
  Download, Link,// 不能用小写的 l
  HelpCircle, 
} from 'lucide-react';

/**
 * -----------------------------------------------------------------------------
 * 巫师编年史 (Wizard's Chronicle) - 完整修复版
 * -----------------------------------------------------------------------------
 * 包含功能：
 * 1. 画布拖拽、缩放
 * 2. 角色/事件 创建与编辑
 * 3. 标签系统、时间排序
 * 4. 导出备份功能
 * 5. 完整 UI 渲染
 */

// 魔法世界专属配色方案
const MAGIC_COLORS = [
  { name: '羊皮纸 (默认)', bg: '#fdf6e3', border: '#8b4513', text: '#2e2010' },
  { name: '狮院红 (勇气)', bg: '#740001', border: '#ae0001', text: '#eeba30' },
  { name: '蛇院绿 (野心)', bg: '#1a472a', border: '#2a623d', text: '#aaaaaa' },
  { name: '鹰院蓝 (智慧)', bg: '#0e1a40', border: '#222f5b', text: '#946b2d' },
  { name: '獾院黄 (忠诚)', bg: '#ecb939', border: '#f0c75e', text: '#372e29' },
  { name: '黑魔法 (反派)', bg: '#1c1c1c', border: '#000000', text: '#dcdcdc' },
  { name: '魔法部 (官方)', bg: '#4b0082', border: '#2e0050', text: '#e6e6fa' },
  { name: '预言/灵体', bg: '#e0f7fa', border: '#b2ebf2', text: '#607d8b' },
];

const MAGIC_ICONS = {
  wand: { component: Wand2, label: '巫师/魔杖' },
  scroll: { component: Scroll, label: '大事件' },
  skull: { component: Skull, label: '反派/死亡' },
  hat: { component: GraduationCap, label: '学院' },
  potion: { component: FlaskConical, label: '魔药' },
  crown: { component: Crown, label: '权力' },
  star: { component: Star, label: '命运' },
  flame: { component: Flame, label: '战斗' },
  feather: { component: Feather, label: '信使' },
  ghost: { component: Ghost, label: '幽灵' },
};

const App = () => {
  // ---------------------------------------------------------------------------
  // 状态管理
  // ---------------------------------------------------------------------------

  // === 新增：坐标提取助手 ===
  // 它可以兼容鼠标(e.clientX)和触摸(e.touches[0].clientX)
  const getEventPos = (e) => {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    // 如果是鼠标事件，直接返回
    return { x: e.clientX, y: e.clientY };
  };
  
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);

  // 视图状态
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState(null);
  const [mode, setMode] = useState('view'); // 'view', 'add-character', 'add-event'
  // === 控制帮助弹窗显示的开关 ===
  const [showHelp, setShowHelp] = useState(false); // 默认是关闭(false)的
  // === 新增：红绿灯，防止自动保存跑太快 ===
  const [isLoaded, setIsLoaded] = useState(false);
  // === 连线暂存区 ===
  // 如果这里有值（例如 { sourceId: '1', targetId: '2' }），就弹出连线设置窗
  const [pendingLink, setPendingLink] = useState(null);
  // 交互状态
  const [selectedId, setSelectedId] = useState(null);
  const [editingNode, setEditingNode] = useState(null); 
  const [dragState, setDragState] = useState(null);
  const [linkingState, setLinkingState] = useState(null);

  const containerRef = useRef(null);

  // ---------------------------------------------------------------------------
  // 初始化与持久化
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const savedData = localStorage.getItem('wizard_chronicle_final');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setNodes(parsed.nodes || []);
        setEdges(parsed.edges || []);
      } catch (e) {
        console.error("Failed to load data", e);
      }
    } else {
      // 如果没有存档，创建默认哈利波特数据
      setNodes([
        { 
          id: '1', type: 'character', x: 200, y: 300, 
          data: { name: '哈利·波特', title: '救世主', date: '1980', colorIdx: 1, icon: 'wand', tags: ['主角', '狮院'], notes: '' } 
        },
        {
          id: '2', type: 'event', x: 500, y: 300,
          data: { name: '霍格沃茨之战', title: '最终决战', date: '1998.05.02', colorIdx: 5, icon: 'flame', tags: ['战争', '结局'], notes: '' } 
        }
      ]);
      setEdges([{id: 'e1', source: '1', target: '2', type: 'enemy', label: '终结'}]);
    }

    // === 新增：关键一步！告诉全场：加载已经完成了！ ===
    setIsLoaded(true);

  }, []);

  useEffect(() => {
    // === 新增：如果还没加载完(红灯)，绝对不要保存！ ===
    if (!isLoaded) return;

    localStorage.setItem('wizard_chronicle_final', JSON.stringify({ nodes, edges, isLoaded }));
  }, [nodes, edges]);

  // ---------------------------------------------------------------------------
  // 逻辑功能：时间排序与导出
  // ---------------------------------------------------------------------------
  const autoLayoutByTime = () => {
    if (nodes.length === 0) return;
    
    const parseYear = (dateStr) => {
      if (!dateStr) return 99999;
      const match = dateStr.match(/\d{4}/);
      return match ? parseInt(match[0]) : 99999;
    };

    const sortedNodes = [...nodes].sort((a, b) => {
      const yearA = parseYear(a.data.date);
      const yearB = parseYear(b.data.date);
      return yearA - yearB;
    });

    const spacingX = 220;
    const startX = 100;
    const centerY = 300;
    
    const newNodes = sortedNodes.map((node, index) => ({
      ...node,
      x: startX + index * spacingX,
      y: centerY + (index % 2 === 0 ? -50 : 50)
    }));

    setNodes(newNodes);
    setTransform({ x: 50, y: 50, scale: 0.8 });
  };

  // === 新增：毁灭咒语（重置世界） ===
  const castDestructionSpell = () => {
    // 1. 二次确认，防止手滑
    if (window.confirm("警告：这将摧毁当前所有的时间线并重置世界！\n确定要施放毁灭咒语吗？")) {
      
      // 2. 清除浏览器的本地存储
      // 注意：这里的 key 必须和你 useEffect 里读取的那个名字一模一样
      localStorage.removeItem('wizard_chronicle_final');
      
      // 3. 刷新页面 (这是最简单的重置状态方法)
      // 页面刷新后，useEffect 会发现没有存档，从而加载默认的哈利波特数据
      window.location.reload();
    }
  };

  const handleExport = () => {
    const dataStr = JSON.stringify({ nodes, edges }, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `wizard_chronicle_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ---------------------------------------------------------------------------
  // 交互逻辑
  // ---------------------------------------------------------------------------
  const handleWheel = (e) => {
    if (e.ctrlKey || e.metaKey || true) {
      e.preventDefault();
      const zoomSensitivity = 0.001;
      const newScale = Math.min(Math.max(0.2, transform.scale - e.deltaY * zoomSensitivity), 3);
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const scaleRatio = newScale / transform.scale;
      setTransform({
        x: mouseX - (mouseX - transform.x) * scaleRatio,
        y: mouseY - (mouseY - transform.y) * scaleRatio,
        scale: newScale
      });
    }
  };

  const handleMouseDown = (e) => {
 // === 新增：检测是否为触摸事件 ===
 const isTouch = e.touches && e.touches.length > 0;

 // 1. 开启画布拖拽 (Panning) 的条件：
 //    A. 鼠标中键 (button === 1)
 //    B. 鼠标左键 + Shift (button === 0 && shiftKey)
 //    C. [新增] 手机触摸 (isTouch) 且不是多指操作
 if (e.button === 1 || (e.button === 0 && e.shiftKey) || isTouch) {
   setIsPanning(true);
   // 使用我们之前写的 getEventPos 获取正确坐标
   const { x, y } = getEventPos(e);
   setPanStart({ x, y });
   return;
    }
// 2. 点击背景的其他逻辑 (比如创建新节点/取消选中)
if (e.target === containerRef.current) {
  if (mode.startsWith('add-')) {
     const rect = containerRef.current.getBoundingClientRect();
     // 注意：这里也要用 getEventPos 确保兼容
     const { x: clientX, y: clientY } = getEventPos(e); 
     const x = (clientX - rect.left - transform.x) / transform.scale;
     const y = (clientY - rect.top - transform.y) / transform.scale;
     createNode(mode === 'add-character' ? 'character' : 'event', x, y);
     setMode('view'); 
      } else {
        setSelectedId(null);
        setEditingNode(null);
      }
}
   // 2. 这里的修改是关键！
    // 我们删掉了 "if (e.target === containerRef.current)" 这个过于严格的检查。
    // 因为由于卡片组件里已经写了 e.stopPropagation() (阻止冒泡)，
    // 所以只要点击事件能传到这里，说明用户点的肯定就是空白处（地板或地毯）。
    
    if (mode.startsWith('add-')) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - transform.x) / transform.scale;
      const y = (e.clientY - rect.top - transform.y) / transform.scale;
      createNode(mode === 'add-character' ? 'character' : 'event', x, y);
      setMode('view'); // 放置完后，自动切回普通模式
   } else {
     // 如果不是为了加角色，点击空白处就是为了“取消选中”
     setSelectedId(null);
     setEditingNode(null);
   }
 };

  const createNode = (type, x, y) => {
    const newNode = {
      id: Date.now().toString(),
      type,
      x, y,
      data: {
        name: type === 'character' ? '新角色' : '新事件',
        title: '',
        date: '',
        colorIdx: type === 'event' ? 0 : 1,
        icon: type === 'character' ? 'wand' : 'scroll',
        tags: [],
        notes: '',
        customImage: null
      }
    };
    setNodes([...nodes, newNode]);
    setSelectedId(newNode.id);
    setEditingNode(newNode);
  };

  const handleDoubleClick = (e) => {
    if (e.target !== containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - transform.x) / transform.scale;
    const y = (e.clientY - rect.top - transform.y) / transform.scale;
    createNode('character', x, y);
  };

  const handleNodeMouseDown = (e, id) => {
    e.stopPropagation();
   // if (mode.startsWith('add-')) return; 
   // === 修改 A：兼容触摸检测 ===
    // 如果是触摸事件(e.touches存在)，就没有 button 的概念，直接认为是左键
    const isTouch = e.touches && e.touches.length > 0;
    
    if (mode.startsWith('add-')) return; 

    // === 修改 B：判定逻辑 ===
    // 如果不是触摸，且是右键/Alt键，则是连线
    if (!isTouch && (e.altKey || e.button === 2 || mode === 'link')) { 
       e.preventDefault();
       setLinkingState({ sourceId: id, mouseX: e.clientX, mouseY: e.clientY });
       return;
    }
    // 注意：移动端暂时先只支持“点击连线按钮”模式连线，不支持长按连线（太复杂先不做）
    if (mode === 'link') {
       const { x, y } = getEventPos(e); // 翻译坐标
       setLinkingState({ sourceId: id, mouseX: x, mouseY: y });
       return;
    }
    

    // 如果是“加人”或“加事件”模式，不准点卡片
    if (mode === 'add-character' || mode === 'add-event') return;
    // 核心修改：如果是“右键”、“Alt键” 或者 “当前是连线模式(link)”
    // 都触发连线逻辑
    if (e.altKey || e.button === 2|| mode === 'link') { 
       e.preventDefault();
       setLinkingState({ sourceId: id, mouseX: e.clientX, mouseY: e.clientY });
       return;
    }
    // 否则，才是移动卡片 (Drag)
    const node = nodes.find(n => n.id === id);
    setSelectedId(id);
    setEditingNode(node);
    // === 修改 C：使用翻译官获取坐标 ===
    const { x, y } = getEventPos(e);

    setDragState({
      id,
      startX: x,// 使用翻译后的 x
      startY: y,// 使用翻译后的 y
      initialX: node.x,
      initialY: node.y
    });
  };

  const handleNodeMouseUp = (e, id) => {
    if (linkingState && linkingState.sourceId !== id) {
     //以下为旧版
      //createEdge(linkingState.sourceId, id);
      // 可选：连线完成后，如果是在连线模式，可以选择是否要自动切回普通模式
      // setMode('view'); // 如果你想连完一次就自动退出连线模式，把这行的注释取消掉
      setPendingLink({ sourceId: linkingState.sourceId, targetId: id });
    }
    setLinkingState(null);
  };

  const handleGlobalMouseMove = useCallback((e) => {
    // === 新增：如果是触摸移动，获取坐标 ===
    const { x, y } = getEventPos(e);

    if (isPanning && panStart) {
      //计算差值
      const dx =x - panStart.x;
      const dy = y - panStart.y;
      setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      setPanStart({ x: x, y: y });// 更新起点
    }
    if (dragState) {
      const dx = (x - dragState.startX) / transform.scale;
      const dy = (y - dragState.startY) / transform.scale;
      setNodes(prev => prev.map(n => n.id === dragState.id ? { ...n, x: dragState.initialX + dx, y: dragState.initialY + dy } : n));
    }
    if (linkingState) {
      setLinkingState(prev => ({ ...prev, mouseX:x, mouseY: y}));
    }
  }, [isPanning, panStart, dragState, linkingState, transform.scale]);

  const handleGlobalMouseUp = () => {
    setIsPanning(false);
    setDragState(null);
    setLinkingState(null);
  };

  // === 新增：用户在弹窗点“确定”后执行这个 ===
  const confirmConnection = (type, label) => {
    if (!pendingLink) return;

    // 添加新连线
    setEdges([
      ...edges, 
      { 
        id: `e-${Date.now()}`, 
        source: pendingLink.sourceId, 
        target: pendingLink.targetId, 
        type,   // 用户选的类型（颜色）
        label   // 用户写的备注
      }
    ]);

    // 清空暂存区（关闭弹窗）
    setPendingLink(null);
  };

  const updateNodeData = (updates) => {
    if (!editingNode) return;
    const newData = { ...editingNode.data, ...updates };
    setNodes(nodes.map(n => n.id === editingNode.id ? { ...n, data: newData } : n));
    setEditingNode({ ...editingNode, data: newData });
  };

  const addTag = (tagText) => {
    if (!tagText) return;
    const currentTags = editingNode.data.tags || [];
    if (!currentTags.includes(tagText)) {
      updateNodeData({ tags: [...currentTags, tagText] });
    }
  };

  const removeTag = (tagText) => {
    const currentTags = editingNode.data.tags || [];
    updateNodeData({ tags: currentTags.filter(t => t !== tagText) });
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    if (window.confirm("确定要删除吗？")) {
      setNodes(nodes.filter(n => n.id !== selectedId));
      setEdges(edges.filter(e => e.source !== selectedId && e.target !== selectedId));
      setSelectedId(null);
      setEditingNode(null);
    }
  };

  const getEdgePath = (s, t) => {
    const sW = s.type === 'event' ? 160 : 120;
    const sH = s.type === 'event' ? 90 : 150;
    const tW = t.type === 'event' ? 160 : 120;
    const tH = t.type === 'event' ? 90 : 150;
    
    const sX = s.x + sW/2, sY = s.y + sH/2;
    const tX = t.x + tW/2, tY = t.y + tH/2;
    
    const deltaX = tX - sX, deltaY = tY - sY;
    const dist = Math.sqrt(deltaX*deltaX + deltaY*deltaY);
    const curve = Math.min(dist * 0.2, 80); 
    
    return `M ${sX} ${sY} C ${sX + curve} ${sY + curve*0.3}, ${tX - curve} ${tY - curve*0.3}, ${tX} ${tY}`;
  };

  return (
    <div className="w-full h-screen bg-[#e3d7bf] overflow-hidden font-serif text-[#2e2010] relative"
    onTouchStart={handleMouseDown}
    onTouchMove={handleGlobalMouseMove}  onTouchEnd={handleGlobalMouseUp}
    onMouseMove={handleGlobalMouseMove} onMouseUp={handleGlobalMouseUp}
    onContextMenu={(e) => e.preventDefault()}
    // === 新增：关键样式，禁止浏览器默认滚动 ===
    style={{ touchAction: 'none' }}
    >
      
      {/* 背景 */}
      <div className="absolute inset-0 pointer-events-none z-0" 
           style={{ 
             backgroundImage: `radial-gradient(#d3c4a9 1px, transparent 1px)`,
             backgroundSize: '40px 40px',
             opacity: 0.5
           }}>
      </div>

      {/* 标题 */}
      <div className="absolute top-6 left-8 z-10 select-none pointer-events-none">
        <h1 className="text-3xl font-bold tracking-widest text-[#4a3b2a] flex items-center gap-3 drop-shadow-md opacity-50" style={{ fontFamily: 'Cinzel, serif' }}>
          THE GRIMOIRE
        </h1>
      </div>

      {/* 底部固定工具栏 (菜单栏) */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex items-center bg-[#fdf6e3] rounded-lg shadow-2xl border-2 border-[#8b4513] px-2 py-2 z-30 gap-2">
        <ToolBtn icon={<User size={20}/>} label="加角色" active={mode === 'add-character'} onClick={() => setMode('add-character')} />
        <ToolBtn icon={<Scroll size={20}/>} label="加事件" active={mode === 'add-event'} onClick={() => setMode('add-event')} />
        <div className="w-px h-8 bg-[#d3c4a9] mx-1"></div>
        {/* === 新增的连线按钮 === */}
        <ToolBtn icon={<Link size={20}/>} label="连线" active={mode === 'link'} onClick={() => setMode(mode === 'link' ? 'view' : 'link')} />
        <ToolBtn icon={<LayoutList size={20}/>} label="时间排序" onClick={autoLayoutByTime} />
        <div className="w-px h-8 bg-[#d3c4a9] mx-1"></div>
        <ToolBtn icon={<Download size={18}/>} label="导出备份" onClick={handleExport} /> 
        <div className="w-px h-8 bg-[#d3c4a9] mx-1"></div>
       
        {/* === 新增：帮助按钮 === */}
        <ToolBtn icon={<HelpCircle size={20}/>} label="说明" onClick={() => setShowHelp(true)} />
        <div className="w-px h-8 bg-[#d3c4a9] mx-1"></div>
        <ToolBtn icon={<ZoomOut size={18}/>} onClick={() => setTransform(t => ({...t, scale: t.scale * 0.8}))} />
        <ToolBtn icon={<RotateCcw size={16}/>} label="100%" onClick={() => setTransform({x:0,y:0,scale:1})} />
        <ToolBtn icon={<ZoomIn size={18}/>} onClick={() => setTransform(t => ({...t, scale: t.scale * 1.2}))} />
       {/* === 新增：毁灭/重置按钮 === */}
        {/* 使用 text-red-800 让它看起来危险一点 */}
        <div className="w-px h-8 bg-[#d3c4a9] mx-1"></div>
        <button 
          onClick={castDestructionSpell}
          className="flex flex-col items-center justify-center px-3 py-1 rounded transition-colors text-red-800 hover:bg-red-100"
          title="重置世界"
          aria-label="重置世界"
        >
          <Trash2 size={18} />
          <span className="text-[10px] font-bold mt-0.5">重置</span>
        </button>
        <div className="w-px h-8 bg-[#d3c4a9] mx-1"></div>
      
      </div>

      {/* 模式提示 */}
      {mode !== 'view' && (
        <div className="absolute top-8 left-1/2 transform -translate-x-1/2 bg-[#8b4513] text-[#fdf6e3] px-4 py-2 rounded-full shadow-lg z-30 text-sm font-bold animate-pulse">
          点击画布空白处以放置{mode === 'add-character' ? '角色' : '事件'}...
        </div>
      )}

      {/* 主画布 */}
      <div ref={containerRef} className="w-full h-full cursor-default"
           onWheel={handleWheel} onMouseDown={handleMouseDown} onDoubleClick={handleDoubleClick}
           style={{ cursor: isPanning ? 'grabbing' : mode !== 'view' ? 'crosshair' : 'default' }}>
        
        <div style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`, transformOrigin: '0 0', width: '100%', height: '100%' }}>
          
          <svg className="overflow-visible absolute top-0 left-0 pointer-events-none z-0">
            {edges.map(edge => {
              const s = nodes.find(n => n.id === edge.source);
              const t = nodes.find(n => n.id === edge.target);
              if(!s || !t) return null;
              const path = getEdgePath(s, t);
              // === 修改开始：定义更丰富的样式映射 ===
              
              // 1. 定义颜色字典
              const edgeColors = {
                neutral: '#5c4033', // 棕色
                family: '#2e2010',  // 深褐实线
                enemy: '#8b0000',   // 鲜红
                love: '#d81b60'     // 粉红
              };
              
              // 2. 获取当前线的颜色，如果找不到类型，就默认棕色
              const strokeColor = edgeColors[edge.type] || '#5c4033';
              // 3. 定义是否是虚线 (只有 neutral 是虚线)
              const isDashed = edge.type === 'neutral' || !edge.type; // 默认也是虚线
              // === 修改结束 ===
            
              return (
                <g key={edge.id} className="pointer-events-auto cursor-pointer" onDoubleClick={() => setEdges(edges.filter(e => e.id !== edge.id))}>
                  <path d={path} stroke={strokeColor} 
                  strokeWidth={edge.type === 'family' ? 3 : 2} 
                  fill="none" 
                  strokeDasharray={isDashed ? '5,5' : 'none'} />
                  {edge.label && (
                    <text x={(s.x+t.x)/2 + (s.type==='event'?80:60)} y={(s.y+t.y)/2 + (s.type==='event'?45:75)} textAnchor="middle" fontSize="10" fill="#4a3b2a" className="bg-[#fdf6e3]">{edge.label}</text>
                  )}
                </g>
              )
            })}
            {linkingState && (
              <line 
                x1={nodes.find(n => n.id === linkingState.sourceId).x + 60}
                y1={nodes.find(n => n.id === linkingState.sourceId).y + 60}
                x2={(linkingState.mouseX - transform.x) / transform.scale}
                y2={(linkingState.mouseY - transform.y) / transform.scale}
                stroke="#8b4513" strokeWidth="2" strokeDasharray="4,4"
              />
            )}
          </svg>

          {nodes.map(node => (
            <NodeCard 
            key={node.id} node={node} selected={selectedId === node.id}
            // === 新增：绑定触摸开始事件 ===
            onTouchStart={(e) => handleNodeMouseDown(e, node.id)}
                          
            onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
            onMouseUp={(e) => handleNodeMouseUp(e, node.id)}
            // 触摸结束其实不需要专门绑，因为冒泡到最外层会被 handleGlobalMouseUp 捕获
            // 但为了保险，可以加上 onTouchEnd
            onTouchEnd={(e) => handleNodeMouseUp(e, node.id)} 
            />
          ))}
        </div>
      </div>

      {/* 编辑面板 */}
      {editingNode && (
        <div className="absolute right-4 top-4 bottom-24 w-80 bg-[#fdf6e3] shadow-2xl z-20 flex flex-col border-l-4 border-[#8b4513] overflow-hidden"
             style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7z' fill='%23d6cbb5' fill-opacity='0.4'/%3E%3C/svg%3E")` }}>
          
          <div className="p-3 bg-[#eaddcf] border-b border-[#8b4513] flex justify-between items-center">
            <h2 className="font-bold text-[#4a3b2a] text-sm">
              {editingNode.type === 'character' ? '人物档案' : '事件记录'}
            </h2>
            <button onClick={() => {setEditingNode(null); setSelectedId(null)}}><X size={18} className="text-[#8b4513]"/></button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {/* 基本信息 */}
            <div>
              <label className="text-[10px] uppercase text-[#8b4513] font-bold">Name / 名称</label>
              <input value={editingNode.data.name} onChange={(e) => updateNodeData({ name: e.target.value })} className="w-full bg-transparent border-b border-[#8b4513] text-lg font-bold text-[#2e2010] outline-none"/>
            </div>

            {/* 时间字段 */}
            <div className="bg-[#f0e6d2] p-2 rounded border border-[#d3c4a9]">
              <label className="text-[10px] uppercase text-[#8b4513] font-bold flex items-center gap-1"><Calendar size={10}/> Timeline / 时间点</label>
              <input 
                value={editingNode.data.date || ''} 
                onChange={(e) => updateNodeData({ date: e.target.value })} 
                placeholder={editingNode.type === 'character' ? "出生年份 (如 1980)" : "发生时间 (如 1998.05.02)"}
                className="w-full bg-transparent text-sm font-mono mt-1 outline-none text-[#4a3b2a]"
              />
            </div>

            {/* 标签系统 */}
            <div>
               <label className="text-[10px] uppercase text-[#8b4513] font-bold flex items-center gap-1"><Tag size={10}/> Tags / 标签</label>
               <div className="flex flex-wrap gap-1 mt-1 mb-2">
                 {(editingNode.data.tags || []).map((tag, i) => (
                   <span key={i} className="text-xs bg-[#eaddcf] text-[#4a3b2a] px-2 py-0.5 rounded-full flex items-center gap-1">
                     {tag} <button onClick={() => removeTag(tag)}><X size={10}/></button>
                   </span>
                 ))}
               </div>
               <input 
                 placeholder="输入标签按回车..." 
                 className="w-full bg-[#fdf6e3] border border-[#d3c4a9] text-xs p-1 rounded"
                 onKeyDown={(e) => {
                   if (e.key === 'Enter') {
                     addTag(e.currentTarget.value);
                     e.currentTarget.value = '';
                   }
                 }}
               />
            </div>

            {editingNode.type === 'character' && (
              <div>
                <label className="text-[10px] uppercase text-[#8b4513] font-bold">Title / 头衔</label>
                <input value={editingNode.data.title || ''} onChange={(e) => updateNodeData({ title: e.target.value })} className="w-full bg-transparent border-b border-[#bcaaa4] text-sm italic outline-none"/>
              </div>
            )}

            {/* 配色与图标 */}
            <div>
              <label className="text-[10px] uppercase text-[#8b4513] font-bold mb-1 block">Style / 样式</label>
              <div className="flex gap-1 mb-2 flex-wrap">
                {MAGIC_COLORS.map((c, idx) => (
                  <button key={idx} onClick={() => updateNodeData({ colorIdx: idx })} className={`w-5 h-5 rounded-full border ${editingNode.data.colorIdx===idx?'ring-2 ring-[#8b4513]':''}`} style={{backgroundColor:c.bg}} title={c.name}
                  aria-label={c.name}/> 
                ))}
              </div>
              <div className="grid grid-cols-5 gap-1">
                {Object.entries(MAGIC_ICONS).map(([key, item]) => {
                  const I = item.component;
                  return <button key={key} onClick={() => updateNodeData({ icon: key })} className={`p-1 rounded flex justify-center ${editingNode.data.icon===key?'bg-[#d3c4a9]':''}`} title={item.label}><I size={16}
                  aria-label={item.label}
                  />
                  </button>
                })}
              </div>
            </div>
            
            <div>
              <label className="text-[10px] uppercase text-[#8b4513] font-bold">Notes / 备注</label>
              <textarea value={editingNode.data.notes || ''} onChange={(e) => updateNodeData({ notes: e.target.value })} className="w-full h-24 bg-[#fdf6e3] border border-[#d3c4a9] p-1 text-xs resize-none rounded"/>
            </div>
          </div>
          
          <div className="p-3 bg-[#eaddcf] border-t border-[#8b4513]">
             <button onClick={deleteSelected} className="w-full text-red-800 text-xs font-bold flex justify-center items-center gap-1 hover:bg-[#d7ccc8] p-1 rounded"><Trash2 size={14}/> 删除卡片</button>
          </div>
        </div>
      )}

      {/* === 新增：帮助说明弹窗 === */}
      {showHelp && (
        <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowHelp(false)}>
          <div className="bg-[#fdf6e3] border-4 border-[#8b4513] p-6 rounded-lg max-w-lg shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowHelp(false)} className="absolute top-2 right-2 text-[#8b4513]"><X size={24}/></button>
            
            <h2 className="text-2xl font-bold text-[#4a3b2a] mb-4 text-center font-serif">操作指南</h2>
            
            <ul className="space-y-3 text-[#4a3b2a] text-sm font-serif">
              <li className="flex items-start gap-2">
                <span className="bg-[#8b4513] text-[#fdf6e3] rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0 mt-0.5">1</span>
                <span><b>移动画布：</b> 按住鼠标 <b className="text-[#8b0000]">中键</b> 拖拽，或按住 <b className="text-[#8b0000]">Shift + 左键</b> 拖拽。</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-[#8b4513] text-[#fdf6e3] rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0 mt-0.5">2</span>
                <span><b>缩放视图：</b> 使用鼠标滚轮缩放，查看全局或细节。</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-[#8b4513] text-[#fdf6e3] rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0 mt-0.5">3</span>
                <span><b>添加内容：</b> 点击下方“加角色”或“加事件”，然后点击画布空白处放置。</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-[#8b4513] text-[#fdf6e3] rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0 mt-0.5">4</span>
                <span><b>建立关系：</b> 点击“连线”按钮（或按住 Alt/右键），从一个卡片拖拽到另一个卡片，<b className="text-[#8b0000]">双击连线清除关系连线。</b></span>
              </li>
              
            </ul>

            <div className="mt-6 text-center text-xs text-[#8b4513]/60 italic">
              "即使是最好的巫师，有时也需要查阅课本。"
            </div>
          </div>
        </div>
      )}
      
       {/* === 新增：连线设置弹窗 === */}
          {pendingLink && (
                  <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-[#fdf6e3] border-4 border-[#8b4513] p-6 rounded-lg shadow-2xl w-80 flex flex-col gap-4 relative">
                      
                      <h3 className="text-xl font-bold text-[#4a3b2a] text-center font-serif">建立契约</h3>
                      
                      {/* 1. 输入关系描述 */}
                      <div>
                        <label className="text-xs font-bold text-[#8b4513] uppercase">关系描述 (Label)</label>
                        <input 
                          id="link-label-input"
                          aria-label="关系描述"
                          placeholder="例如：师徒、宿敌..."
                          className="w-full bg-[#eaddcf] border border-[#d3c4a9] p-2 mt-1 rounded text-[#2e2010] outline-none focus:border-[#8b4513]"
                          autoFocus
                        />
                      </div>

                      {/* 2. 选择关系类型 (本质是选颜色) */}
                      <div>
                        <label className="text-xs font-bold text-[#8b4513] uppercase mb-2 block">关系类型 (Type)</label>
                        <div className="grid grid-cols-2 gap-2">
                          {/* 我们用 data-type 属性来存值，点击时读取 */}
                          {[
                            { id: 'neutral', label: '普通 (虚线)', color: '#5c4033' },
                            { id: 'family', label: '血亲 (实线)', color: '#2e2010' },
                            { id: 'enemy', label: '宿敌 (红线)', color: '#8b0000' },
                            { id: 'love', label: '爱恋 (粉线)', color: '#d81b60' },
                          ].map(t => (
                            <button 
                              key={t.id}
                              className="text-xs p-2 border border-[#d3c4a9] rounded hover:bg-[#eaddcf] flex items-center gap-2"
                              onClick={() => {
                                // 获取输入框的值
                                const val = document.getElementById('link-label-input').value;
                                // 调用确认函数
                                confirmConnection(t.id, val);
                              }}
                            >
                              <div className="w-3 h-3 rounded-full" style={{backgroundColor: t.color}}></div>
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 取消按钮 */}
                      <button 
                        onClick={() => setPendingLink(null)} 
                        className="text-xs text-[#8b4513] underline text-center mt-2 hover:text-[#4a3b2a]"
                      >
                        放弃连接
                      </button>
                    </div>
                  </div>
                )}

    </div> // <--- 这是 App 组件最后的结束标签
  );
};

// -----------------------------------------------------------------------------
// 组件：卡片渲染
// -----------------------------------------------------------------------------
const NodeCard = ({ node, selected, onMouseDown, onMouseUp }) => {
  // === 新增：安全护盾 ===
  // 如果 node 不存在，或者 node.data 丢了，直接返回 null（不渲染），防止报错白屏
  if (!node || !node.data) {
    return null;
  }
  const { name, title, date, colorIdx, icon, tags } = node.data;
  const theme = MAGIC_COLORS[colorIdx || 0];
  const Icon = MAGIC_ICONS[icon || 'wand'].component;
  const isEvent = node.type === 'event';

  // 区分人物(竖)与事件(横)的尺寸
  const width = isEvent ? '160px' : '120px';
  const minHeight = isEvent ? '90px' : '150px';

  return (
    <div
      className={`absolute flex flex-col items-center group
        ${selected ? 'z-30' : 'z-10 hover:z-20'}
      `}
      style={{ left: node.x, top: node.y, width, cursor: 'grab' }}
      onMouseDown={onMouseDown} onMouseUp={onMouseUp}
    >
      {/* 视觉主体 */}
      <div 
        className={`relative w-full flex ${isEvent ? 'flex-row items-center text-left' : 'flex-col items-center text-center'} p-2 border-2 shadow-md transition-transform
          ${isEvent ? 'rounded-sm border-double' : 'rounded-lg'}
          ${selected ? 'ring-4 ring-[#d4af37] ring-opacity-60 scale-105' : 'hover:scale-105'}
        `}
        style={{ 
          backgroundColor: theme.bg, borderColor: theme.border, color: theme.text, minHeight 
        }}
      >
        {/* 图标 */}
        <div className={`flex items-center justify-center shrink-0 border-2 border-current opacity-80
            ${isEvent ? 'w-10 h-10 rounded mr-2' : 'w-16 h-16 rounded-full mb-2'}
          `}
        >
           <Icon size={isEvent ? 20 : 32} />
        </div>

        {/* 文字内容 */}
        <div className="flex-1 min-w-0">
           {/* 事件优先显示时间 */}
           {isEvent && date && <div className="text-[10px] font-mono opacity-80 mb-0.5">{date}</div>}
           
           <div className={`font-bold font-serif leading-tight truncate ${isEvent?'text-sm':'text-sm'}`}>{name}</div>
           
           {/* 人物优先显示头衔 */}
           {!isEvent && title && <div className="text-[10px] opacity-70 italic truncate mt-0.5">{title}</div>}
           {!isEvent && date && <div className="text-[9px] opacity-60 font-mono mt-1">{date}</div>}

           {/* 标签展示 */}
           {tags && tags.length > 0 && (
             <div className={`flex flex-wrap gap-1 mt-1 ${isEvent?'justify-start':'justify-center'}`}>
               {tags.slice(0, 3).map((t,i) => (
                 <span key={i} className="text-[8px] px-1 rounded-sm border border-current opacity-60">{t}</span>
               ))}
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

const ToolBtn = ({ icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center justify-center px-3 py-1 rounded transition-colors
      ${active ? 'bg-[#4a3b2a] text-[#fdf6e3]' : 'text-[#4a3b2a] hover:bg-[#eaddcf]'}
    `}
    title={label}
  >
    {icon}
    {label && <span className="text-[10px] font-bold mt-0.5">{label}</span>}
  </button>
);

export default App;