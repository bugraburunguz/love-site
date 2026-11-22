package com.lovesite;

import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.datasource.DelegatingDataSource;

import javax.sql.DataSource;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Callable;

/**
 * Records the SQL the calling thread sends while {@link #record} runs (other threads are ignored). Test classes that
 * {@code @Import} it share one Spring context.
 */
@TestConfiguration
public class StatementCounter {

    private static final ThreadLocal<List<String>> STATEMENTS = new ThreadLocal<>();
    private static final Set<String> PREPARING = Set.of("prepareStatement", "createStatement", "prepareCall");

    public static List<String> record(Callable<?> action) throws Exception {
        List<String> sql = new ArrayList<>();
        STATEMENTS.set(sql);
        try {
            action.call();
        } finally {
            STATEMENTS.remove();
        }
        return sql;
    }

    @Bean
    static BeanPostProcessor countStatements() {
        return new BeanPostProcessor() {
            @Override
            public Object postProcessAfterInitialization(Object bean, String beanName) {
                if (!(bean instanceof DataSource ds) || bean instanceof DelegatingDataSource) {
                    return bean;
                }
                return new DelegatingDataSource(ds) {
                    @Override
                    public Connection getConnection() throws SQLException {
                        return wrap(super.getConnection());
                    }
                };
            }
        };
    }

    private static Connection wrap(Connection target) {
        return (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(), new Class<?>[]{Connection.class}, (p, m, args) -> {
            List<String> sql = STATEMENTS.get();
            if (sql != null && PREPARING.contains(m.getName())) {
                sql.add(args != null && args.length > 0 && args[0] instanceof String s ? s : "");
            }
            try {
                return m.invoke(target, args);
            } catch (InvocationTargetException e) {
                throw e.getCause();
            }
        });
    }
}
