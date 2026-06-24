# AI Engineering Agent — 项目开发规范

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec

## 代码规范

### 注释语言

**所有函数、类、方法必须使用中文注释。** 包括但不限于：

- JSDoc 注释 (`/** ... */`)
- 行内注释 (`// ...`)
- TypeScript 类型定义注释
- Vue/React 组件 Props 注释
- 接口和类型定义注释

```typescript
/**
 * 用户服务 — 处理用户注册、登录、资料管理
 */
export class UserService {
  /**
   * 根据邮箱查找用户
   * @param email 用户邮箱
   * @returns 用户对象或 null
   */
  async findByEmail(email: string): Promise<User | null> {
    // 从数据库中查询用户记录
    const user = await db.user.findUnique({ where: { email } });
    return user;
  }
}
```

### 命名规范

- 文件/目录: kebab-case (`user-service.ts`, `use-chat.ts`)
- 类/接口/类型: PascalCase (`UserService`, `ChatMessage`)
- 函数/变量/方法: camelCase (`findByEmail`, `userName`)
- 常量/枚举值: UPPER_SNAKE_CASE (`MAX_RETRY_COUNT`)

### TypeScript 规范

- 所有代码优先使用 TypeScript
- 禁止使用 `any` 类型，无法确定类型时使用 `unknown`
- 函数参数和返回值必须显式标注类型
- 接口定义放在独立的 `types.ts` 或同文件的顶部

## Git 提交规范

### 提交语言

**所有 Git 提交信息必须使用中文。** 格式要求：

```
<类型>: <简短描述>

<详细说明（可选）>
```

### 允许的类型

| 类型 | 说明 |
|------|------|
| feat | 新功能 |
| fix | 修复 bug |
| docs | 文档变更 |
| style | 代码格式调整（不影响功能） |
| refactor | 重构（不改变功能） |
| perf | 性能优化 |
| test | 测试相关 |
| chore | 构建/工具/依赖变更 |
| revert | 回滚 |

### 示例

```
feat: 新增架构方案版本历史下拉菜单

- 镜像 DesignPanel 的版本管理 UI 模式
- 支持版本切换、回退
- 旧版本自动重建 markdown 渲染
```

### 提交约束

- 每个提交应该是一个独立的、可审查的逻辑变更
- 禁止提交 `WIP` 或 `临时保存` 等无意义信息
- 提交前确保代码通过 TypeScript 编译和 lint 检查
- `git push` 前先拉取最新代码

## 项目架构约定

- 新功能先出架构方案 (`/api/generate/architecture`)，再生成代码
- 架构方案支持对话式精炼调整 (`mode: 'architecture-refinement'`)
- 代码生成遵循三级降级: `architectureDesign → resolvedTargetProfile → 硬编码默认值`
- 所有生成的代码必须包含 loading/empty/error 状态处理
- 列表搜索必须实现 300ms debounce
- 危险操作必须实现二次确认弹窗
- 表单提交时按钮必须禁用防止重复提交
